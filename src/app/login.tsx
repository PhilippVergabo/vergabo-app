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
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { uebersetzeAuthFehler } from '@/lib/authFehler'
import { VergaboLogo } from '@/components/VergaboLogo'
import { C } from '@/lib/theme'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setLoading(false)
      Alert.alert('Anmeldung fehlgeschlagen', uebersetzeAuthFehler(error))
      return
    }

    setLoading(false)
    // Navigation + Rollen-Weiche übernimmt _layout.tsx / index.tsx (anbieter | auftraggeber)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <View style={styles.brandBlock}>
          <VergaboLogo size={64} />
          <Text style={styles.brand}>vergabo</Text>
        </View>
        <Text style={styles.subtitle}>Anbieter & Auftraggeber</Text>

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
        <TextInput
          style={styles.input}
          placeholder="Passwort"
          placeholderTextColor={C.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          editable={!loading}
        />
        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          <Text style={styles.buttonText}>{loading ? 'Anmelden …' : 'Anmelden'}</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/passwort-vergessen')}
          hitSlop={8}
          style={styles.forgotRow}
        >
          <Text style={styles.forgotLink}>Passwort vergessen?</Text>
        </Pressable>

        <View style={styles.registerRow}>
          <Text style={styles.hint}>Noch kein Konto?</Text>
          <Pressable onPress={() => router.push('/registrieren-auswahl')} hitSlop={8}>
            <Text style={styles.registerLink}>Jetzt registrieren</Text>
          </Pressable>
        </View>
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
  brandBlock: {
    alignItems: 'center',
    gap: 10,
  },
  brand: {
    fontSize: 32,
    fontWeight: '700',
    color: C.primary,
    textAlign: 'center',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.bg,
    // Explizit 0: Fabric recycelt native TextInput-Views — ohne gesetzten Wert
    // "erbt" der Placeholder sonst sporadisch letterSpacing eines anderen
    // Inputs (z. B. codeInput in admin.tsx mit letterSpacing: 8 → „E - M a i l").
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
  forgotRow: {
    alignItems: 'center',
    marginTop: 2,
  },
  forgotLink: {
    fontSize: 13,
    color: C.muted,
    textDecorationLine: 'underline',
  },
  hint: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  registerLink: {
    fontSize: 13,
    color: C.accent,
    fontWeight: '700',
  },
})

