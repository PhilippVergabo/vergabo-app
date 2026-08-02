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

/** true, wenn ein Auth-Fehler „CAPTCHA verlangt/fehlgeschlagen" bedeutet. */
export function istCaptchaFehler(error: { message?: string } | null | undefined): boolean {
  return !!error?.message && /captcha/i.test(error.message)
}

/**
 * Öffnet die Sicherheitsprüfung im Safari-Fenster und liefert den Token —
 * oder null, wenn abgebrochen/fehlgeschlagen. Token ist einmalig, ~300 s gültig.
 */
export async function fordereCaptchaToken(): Promise<string | null> {
  try {
    const ergebnis = await WebBrowser.openAuthSessionAsync(
      'https://www.vergabo.de/turnstile-app?app=1',
      'vergaboapp://turnstile',
    )
    if (ergebnis.type !== 'success') return null
    const roh = ergebnis.url.match(/[?&]token=([^&#]+)/)?.[1]
    return roh ? decodeURIComponent(roh) : null
  } catch {
    return null
  }
}
