import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { C } from '@/lib/theme'

// Cloudflare Turnstile über ein ECHTES Safari-Fenster (ASWebAuthenticationSession
// via expo-web-browser): Die App öffnet www.vergabo.de/turnstile-app?app=1, dort
// wird die Challenge gelöst, die Seite leitet auf vergaboapp://turnstile?token=…
// weiter und das Fenster schließt sich. In eingebetteten WebViews schlägt
// Cloudflares Umgebungsprüfung dagegen fehl — probiert und verworfen:
// HTML-String (haengt bei „Verifiziere…"), gehostete Seite in der WebView
// (Interaktion + Fehlschlag), Safari-UA-Spoof (Fehlschlag).
//
// Der Token wird nativ an die Supabase-Auth-Aufrufe gebunden
// (options.captchaToken); solange der Supabase-Schalter (Auth → Attack
// Protection) aus ist, ignoriert GoTrue ihn (forward-compatible).

export const CAPTCHA_ENABLED = !!process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY

type Props = {
  /** Erfolgreich gelöst → Token (einmalig gültig, ~300 s). */
  onVerify: (token: string) => void
  /** Abgebrochen/fehlgeschlagen → Token im State verwerfen. */
  onExpire: () => void
}

export function Turnstile({ onVerify, onExpire }: Props) {
  const [status, setStatus] = useState<'offen' | 'laeuft' | 'bestanden'>('offen')

  async function pruefen() {
    if (status === 'laeuft') return
    setStatus('laeuft')
    try {
      const ergebnis = await WebBrowser.openAuthSessionAsync(
        'https://www.vergabo.de/turnstile-app?app=1',
        'vergaboapp://turnstile',
      )
      const token =
        ergebnis.type === 'success'
          ? decodeURIComponent(ergebnis.url.match(/[?&]token=([^&#]+)/)?.[1] ?? '')
          : ''
      if (token) {
        setStatus('bestanden')
        onVerify(token)
      } else {
        setStatus('offen')
        onExpire()
      }
    } catch {
      setStatus('offen')
      onExpire()
    }
  }

  if (!CAPTCHA_ENABLED) return null

  if (status === 'bestanden') {
    return (
      <View style={[styles.box, styles.boxOk]}>
        <Text style={styles.okText}>✓ Sicherheitsprüfung bestanden</Text>
      </View>
    )
  }

  return (
    <Pressable
      style={[styles.box, status === 'laeuft' && styles.boxLaeuft]}
      onPress={pruefen}
      disabled={status === 'laeuft'}
      accessibilityRole="button"
      accessibilityLabel="Sicherheitsprüfung durchführen"
    >
      <Text style={styles.btnText}>
        {status === 'laeuft' ? 'Sicherheitsprüfung läuft …' : '🛡️ Sicherheitsprüfung durchführen'}
      </Text>
      <Text style={styles.hinweis}>Geschützt durch Cloudflare Turnstile</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 2,
  },
  boxLaeuft: { opacity: 0.6 },
  boxOk: { borderColor: C.primary, backgroundColor: '#e8f0e9' },
  okText: { fontSize: 15, fontWeight: '600', color: C.primary },
  btnText: { fontSize: 15, fontWeight: '500', color: C.text },
  hinweis: { fontSize: 11, color: C.muted },
})
