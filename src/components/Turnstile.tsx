import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'

// Cloudflare Turnstile als Bedarfs-Zwischenschritt (kein sichtbares Widget):
// Die Auth-Aufrufe laufen zuerst OHNE Token. Verlangt Supabase/GoTrue ein
// CAPTCHA (Schalter Auth → Attack Protection aktiv), öffnet die App ein echtes
// Safari-Fenster (ASWebAuthenticationSession) mit www.vergabo.de/turnstile-app,
// die Seite leitet nach gelöster Challenge auf vergaboapp://turnstile?token=…
// zurück, und der Aufruf wird einmal mit Token wiederholt.
//
// Warum so: Eingebettete WebViews bestehen Cloudflares Umgebungsprüfung nicht
// (probiert und verworfen: HTML-String → hängt bei „Verifiziere…"; gehostete
// Seite in der WebView → Interaktion + Fehlschlag; Safari-UA-Spoof →
// Fehlschlag). Und solange der Supabase-Schalter aus ist, sieht der Nutzer so
// gar nichts — kein Dauer-Widget im Formular.

/**
 * Obergrenze für den Safari-Zwischenschritt.
 *
 * openAuthSessionAsync löst sein Promise in seltenen Fällen NIE auf — etwa wenn
 * das Safari-Fenster geschlossen wird, ohne dass iOS das Ergebnis zurückmeldet.
 * Ohne Obergrenze blieb der aufrufende Screen dann dauerhaft im Ladezustand
 * hängen: Button ausgegraut, Eingabefelder wegen editable={!loading} gesperrt —
 * die Anmeldung war ohne App-Neustart nicht mehr möglich. Deshalb wird hier in
 * jedem Fall ein Ergebnis geliefert.
 */
const CAPTCHA_TIMEOUT_MS = 90_000

const PRUEF_URL = 'https://www.vergabo.de/turnstile-app?app=1'
const RUECKSPRUNG = 'vergaboapp://turnstile'

/** Verhindert zwei gleichzeitige Safari-Sessions (die zweite bliebe hängen). */
let laeuftBereits = false

export type CaptchaErgebnis =
  | { ok: true; token: string }
  | { ok: false; grund: 'abgebrochen' | 'zeitueberschreitung' | 'fehler' }

/** Verständlicher Text zum Abbruchgrund — in allen Auth-Screens identisch. */
export function captchaFehlerText(grund: 'abgebrochen' | 'zeitueberschreitung' | 'fehler'): string {
  if (grund === 'zeitueberschreitung') {
    return 'Die Sicherheitsprüfung hat zu lange gedauert. Bitte versuchen Sie es erneut.'
  }
  if (grund === 'fehler') {
    return 'Die Sicherheitsprüfung konnte nicht geöffnet werden. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.'
  }
  return 'Die Sicherheitsprüfung wurde abgebrochen.'
}

/** true, wenn ein Auth-Fehler „CAPTCHA verlangt/fehlgeschlagen" bedeutet. */
export function istCaptchaFehler(error: { message?: string } | null | undefined): boolean {
  return !!error?.message && /captcha/i.test(error.message)
}

/**
 * Wie der Rücksprung bei uns ankommt.
 *
 * 'session'  — Regelfall: Das Auth-Fenster fängt vergaboapp://turnstile selbst
 *              ab und liefert die URL als Ergebnis zurück.
 * 'deeplink' — Beobachtet auf iOS 26: Der Rücksprung wird stattdessen an die
 *              App durchgereicht. Das Auth-Fenster meldet dann NIE ein Ergebnis
 *              — ohne diesen zweiten Weg wartete der Login-Screen endlos, und
 *              expo-router zeigte „Unmatched Route".
 * 'timeout'  — Nichts von beidem kam an (siehe CAPTCHA_TIMEOUT_MS).
 */
type RennErgebnis =
  | { art: 'session'; wert: WebBrowser.WebBrowserAuthSessionResult }
  | { art: 'deeplink'; token: string }
  | { art: 'timeout' }

function tokenAusUrl(url: string): string | null {
  const roh = url.match(/[?&]token=([^&#]+)/)?.[1]
  return roh ? decodeURIComponent(roh) : null
}

function schliesseFenster() {
  try {
    WebBrowser.dismissAuthSession()
  } catch {
    // Kein Fenster mehr offen — nicht kritisch.
  }
}

/**
 * Öffnet die Sicherheitsprüfung im Safari-Fenster und liefert den Token.
 * Löst IMMER auf — notfalls per Zeitgrenze (siehe CAPTCHA_TIMEOUT_MS).
 * Token ist einmalig, ~300 s gültig.
 */
export async function fordereCaptchaToken(): Promise<CaptchaErgebnis> {
  if (laeuftBereits) return { ok: false, grund: 'abgebrochen' }
  laeuftBereits = true

  let timer: ReturnType<typeof setTimeout> | undefined
  let abo: ReturnType<typeof Linking.addEventListener> | undefined

  try {
    const ergebnis = await Promise.race<RennErgebnis>([
      WebBrowser.openAuthSessionAsync(PRUEF_URL, RUECKSPRUNG).then(
        (wert) => ({ art: 'session', wert }) as const,
      ),
      // Zweiter Weg (siehe RennErgebnis): Der Rücksprung erreicht die App als
      // normaler Deeplink, statt vom Auth-Fenster abgefangen zu werden.
      new Promise<RennErgebnis>((resolve) => {
        abo = Linking.addEventListener('url', ({ url }) => {
          if (!url.startsWith(RUECKSPRUNG)) return
          const token = tokenAusUrl(url)
          if (token) resolve({ art: 'deeplink', token })
        })
      }),
      new Promise<RennErgebnis>((resolve) => {
        timer = setTimeout(() => resolve({ art: 'timeout' }), CAPTCHA_TIMEOUT_MS)
      }),
    ])

    if (ergebnis.art === 'timeout') {
      schliesseFenster()
      return { ok: false, grund: 'zeitueberschreitung' }
    }

    if (ergebnis.art === 'deeplink') {
      // Das Safari-Fenster bleibt in diesem Fall offen — selbst schließen.
      schliesseFenster()
      return { ok: true, token: ergebnis.token }
    }

    if (ergebnis.wert.type !== 'success') return { ok: false, grund: 'abgebrochen' }

    const token = tokenAusUrl(ergebnis.wert.url)
    if (!token) return { ok: false, grund: 'fehler' }
    return { ok: true, token }
  } catch {
    return { ok: false, grund: 'fehler' }
  } finally {
    if (timer) clearTimeout(timer)
    abo?.remove()
    laeuftBereits = false
  }
}
