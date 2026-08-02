import { useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { C } from '@/lib/theme'

// Cloudflare Turnstile — lädt die gehostete Mini-Seite www.vergabo.de/turnstile-app
// in einer WebView. Bewusst KEIN HTML-String (loadHTMLString + baseUrl): dabei
// fehlt der echte Seitenkontext (Cookies/Storage/Navigation) und Cloudflares
// Challenge hängt dauerhaft bei „Verifiziere…". Auf der echten Seite läuft das
// Widget in genau der Umgebung, in der es im Web funktioniert; das Ergebnis
// kommt per postMessage als JSON zurück:
//   { typ: 'token', token } | { typ: 'expired' } | { typ: 'error' }
// Protokoll-Gegenstück: vergabo/app/turnstile-app/page.tsx
//
// Der Token wird nativ an die Supabase-Auth-Aufrufe gebunden
// (options.captchaToken); solange der Supabase-Schalter (Auth → Attack
// Protection) aus ist, ignoriert GoTrue ihn (forward-compatible).

export const CAPTCHA_ENABLED = !!process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY

type Props = {
  /** Erfolgreich gelöst → Token (einmalig gültig, ~300 s). */
  onVerify: (token: string) => void
  /** Token abgelaufen oder Widget-Fehler → Token im State verwerfen. */
  onExpire: () => void
}

// Vollständiger Safari-UA: Die Standard-Kennung der WKWebView (ohne
// „Version/… Safari/…") ist für Cloudflares Umgebungsprüfung ein
// In-App-Browser-Signal — die Challenge verlangt dann Interaktion und
// schlägt trotzdem fehl. Mit Safari-UA wird die WebView wie der echte
// Browser behandelt, in dem das Widget nachweislich läuft.
const SAFARI_UA =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    : undefined

export function Turnstile({ onVerify, onExpire }: Props) {
  // Grundform 65 px; im interaktiven Modus wächst das Widget — die Seite meldet
  // ihre tatsächliche Höhe, damit die Challenge nicht abgeschnitten wird.
  const [hoehe, setHoehe] = useState(71)

  if (!CAPTCHA_ENABLED) return null

  return (
    <View style={[styles.rahmen, { height: Math.min(Math.max(hoehe, 71), 500) }]}>
      <WebView
        source={{ uri: 'https://www.vergabo.de/turnstile-app' }}
        userAgent={SAFARI_UA}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as {
              typ: string
              token?: string
              hoehe?: number
            }
            if (msg.typ === 'hoehe' && typeof msg.hoehe === 'number') setHoehe(msg.hoehe + 6)
            else if (msg.typ === 'token' && msg.token) onVerify(msg.token)
            else onExpire()
          } catch {
            onExpire()
          }
        }}
        // Cookies + DOM-Storage braucht die Challenge für ihre Prüfung.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        style={styles.webview}
        // Kein Scrollen/Zoomen — das Widget ist ein einzelnes Interaktionselement.
        scrollEnabled={false}
        setSupportMultipleWindows={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Höhe kommt dynamisch von der Seite (min 71, deckelt bei 500); ohne feste
  // Höhe kollabiert die WebView in Flex-Layouts auf 0.
  rahmen: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  webview: { flex: 1, backgroundColor: 'transparent' },
})
