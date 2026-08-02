import { StyleSheet, View } from 'react-native'
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

export function Turnstile({ onVerify, onExpire }: Props) {
  if (!CAPTCHA_ENABLED) return null

  return (
    <View style={styles.rahmen}>
      <WebView
        source={{ uri: 'https://www.vergabo.de/turnstile-app' }}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { typ: string; token?: string }
            if (msg.typ === 'token' && msg.token) onVerify(msg.token)
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
  // Feste Höhe: das Standard-Widget ist 65 px hoch; ohne feste Höhe kollabiert
  // die WebView in Flex-Layouts auf 0.
  rahmen: {
    height: 71,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  webview: { flex: 1, backgroundColor: 'transparent' },
})
