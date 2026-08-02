import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { C } from '@/lib/theme'

// Cloudflare Turnstile in einer WebView — Gegenstück zu components/Turnstile.tsx
// im Web. Der Token wird nativ an die Supabase-Auth-Aufrufe gebunden
// (options.captchaToken); solange der Supabase-Schalter (Auth → Attack
// Protection) aus ist, ignoriert GoTrue ihn (forward-compatible).
//
// baseUrl www.vergabo.de: Turnstile prüft die Hostname-Allowlist des Widgets —
// die WebView muss sich als erlaubte Domain ausweisen, sonst rendert das Widget
// einen Domain-Fehler. Es lädt nur das Cloudflare-Script, keine Vergabo-Seite.

export const CAPTCHA_ENABLED = !!process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY

type Props = {
  /** Erfolgreich gelöst → Token (einmalig gültig, ~300 s). */
  onVerify: (token: string) => void
  /** Token abgelaufen oder Widget-Fehler → Token im State verwerfen. */
  onExpire: () => void
}

export function Turnstile({ onVerify, onExpire }: Props) {
  const html = useMemo(() => {
    const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? ''
    return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    #widget { display: flex; justify-content: center; padding-top: 2px; }
  </style>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=_onload" async defer></script>
</head>
<body>
  <div id="widget"></div>
  <script>
    function _post(msg) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
    function _onload() {
      turnstile.render('#widget', {
        sitekey: ${JSON.stringify(siteKey)},
        language: 'de',
        callback: function (token) { _post({ typ: 'token', token: token }); },
        'expired-callback': function () { _post({ typ: 'expired' }); },
        'error-callback': function () { _post({ typ: 'error' }); }
      });
    }
  </script>
</body>
</html>`
  }, [])

  if (!CAPTCHA_ENABLED) return null

  return (
    <View style={styles.rahmen}>
      <WebView
        originWhitelist={['https://*']}
        source={{ html, baseUrl: 'https://www.vergabo.de' }}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { typ: string; token?: string }
            if (msg.typ === 'token' && msg.token) onVerify(msg.token)
            else onExpire()
          } catch {
            onExpire()
          }
        }}
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
