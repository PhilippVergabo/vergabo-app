import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { API_URL } from '@/lib/config'
import { captchaFehlerText, fordereCaptchaToken } from '@/components/Turnstile'
import { C } from '@/lib/theme'

// Passwort-Reset per E-Mail-Link. Der Link führt auf die Web-Plattform
// (/passwort-reset), wo das neue Passwort gesetzt wird. Die Erfolgsmeldung
// ist bewusst neutral formuliert — kein E-Mail-Enumeration-Leak.

export default function PasswortVergessenScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [gesendet, setGesendet] = useState(false)

  async function handleReset() {
    const mail = email.trim()
    if (!mail || loading) return
    setLoading(true)

    // Über das eigene Backend: Dieser Endpunkt verschickt E-Mails und ist damit
    // der Mail-Flut-Vektor schlechthin — dort greift ein Rate-Limit. Das
    // Reset-Ziel setzt der Server, nicht der Client (sonst offener Redirect).
    const anfordern = (captchaToken?: string) =>
      fetch(`${API_URL}/api/app-auth/passwort-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail, captchaToken }),
      })

    try {
      let antwort = await anfordern()
      let inhalt = (await antwort.json().catch(() => ({}))) as { error?: string; resetIn?: number }

      // CAPTCHA-Zwischenschritt nur, wenn Supabase ihn verlangt. Bricht der
      // Nutzer ab, KEINE Erfolgsmeldung zeigen — es wurde ja nichts gesendet.
      if (inhalt.error === 'captcha_required') {
        const captcha = await fordereCaptchaToken()
        if (!captcha.ok) {
          Alert.alert('Nicht gesendet', captchaFehlerText(captcha.grund))
          return
        }
        antwort = await anfordern(captcha.token)
        inhalt = (await antwort.json().catch(() => ({}))) as typeof inhalt
      }

      if (inhalt.error === 'rate_limited') {
        const minuten = inhalt.resetIn ?? 60
        Alert.alert(
          'Zu viele Anfragen',
          `Es wurden bereits mehrere Links angefordert. Bitte versuchen Sie es in ${minuten} Minute${minuten === 1 ? '' : 'n'} erneut.`,
        )
        return
      }

      // Sonst bewusst kein Fehler-Branch nach außen: die Antwort verrät nicht,
      // ob die Adresse registriert ist.
      setGesendet(true)
    } catch {
      Alert.alert(
        'Nicht gesendet',
        'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Eigener Zurück-Button statt des nativen: Nach Abmelden entsteht der
          Login über mehrere router.replace-Schritte — der native Button wird
          dann zwar angezeigt, reagiert aber nicht (bekanntes Stack-Problem,
          vgl. Kommentar in _layout.tsx und Fallback im Auftragsdetail).
          Dieser Button funktioniert in beiden Fällen. */}
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Zurück zum Login"
            >
              <Text style={styles.zurueck}>‹ Zurück</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.card}>
        <Text style={styles.title}>Passwort zurücksetzen</Text>
        <Text style={styles.beschreibung}>
          Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link, mit dem Sie ein neues
          Passwort festlegen können.
        </Text>

        {gesendet ? (
          <View style={styles.erfolgBox}>
            <Text style={styles.erfolgText}>
              Falls ein Konto existiert, haben wir Ihnen einen Link geschickt.
            </Text>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="E-Mail"
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              editable={!loading}
            />
            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={loading || !email.trim()}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              <Text style={styles.buttonText}>{loading ? 'Senden …' : 'Link senden'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    gap: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
  },
  beschreibung: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.bg,
    // Explizit 0 — siehe Kommentar in login.tsx (Fabric-View-Recycling).
    letterSpacing: 0,
  },
  button: {
    backgroundColor: C.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  erfolgBox: {
    backgroundColor: C.ok,
    borderRadius: 8,
    padding: 14,
  },
  erfolgText: {
    fontSize: 14,
    color: C.primary,
    lineHeight: 20,
  },
  zurueck: {
    color: '#3a5a3e',
    fontSize: 16,
    fontWeight: '600',
  },
})
