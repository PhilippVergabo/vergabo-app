import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { C } from '@/lib/theme'

// Passwort-Reset per E-Mail-Link. Der Link führt auf die Web-Plattform
// (/passwort-reset), wo das neue Passwort gesetzt wird. Die Erfolgsmeldung
// ist bewusst neutral formuliert — kein E-Mail-Enumeration-Leak.

export default function PasswortVergessenScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [gesendet, setGesendet] = useState(false)

  async function handleReset() {
    const mail = email.trim()
    if (!mail || loading) return
    setLoading(true)

    await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: 'https://www.vergabo.de/passwort-reset',
    })

    // Bewusst kein Fehler-Branch nach außen: die Antwort verrät nicht,
    // ob die Adresse registriert ist.
    setLoading(false)
    setGesendet(true)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
})
