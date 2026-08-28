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
 * Öffnet die Sicherheitsprüfung im Safari-Fenster und liefert den Token.
 * Löst IMMER auf — notfalls per Zeitgrenze (siehe CAPTCHA_TIMEOUT_MS).
 * Token ist einmalig, ~300 s gültig.
 */
export async function fordereCaptchaToken(): Promise<CaptchaErgebnis> {
  if (laeuftBereits) return { ok: false, grund: 'abgebrochen' }
  laeuftBereits = true

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const ergebnis = await Promise.race([
      WebBrowser.openAuthSessionAsync(
        'https://www.vergabo.de/turnstile-app?app=1',
        'vergaboapp://turnstile',
      ),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), CAPTCHA_TIMEOUT_MS)
      }),
    ])

    if (ergebnis === 'timeout') {
      // Fenster aktiv schließen, sonst bliebe es über dem Formular stehen.
      try {
        WebBrowser.dismissAuthSession()
      } catch {
        // Kein Fenster mehr offen — nicht kritisch.
      }
      return { ok: false, grund: 'zeitueberschreitung' }
    }

    if (ergebnis.type !== 'success') return { ok: false, grund: 'abgebrochen' }

    const roh = ergebnis.url.match(/[?&]token=([^&#]+)/)?.[1]
    if (!roh) return { ok: false, grund: 'fehler' }
    return { ok: true, token: decodeURIComponent(roh) }
  } catch {
    return { ok: false, grund: 'fehler' }
  } finally {
    if (timer) clearTimeout(timer)
    laeuftBereits = false
  }
}
