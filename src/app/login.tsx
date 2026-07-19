import { useState } from 'react'
import {
  ActivityIndicator,
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
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { uebersetzeAuthFehler } from '@/lib/authFehler'
import { VergaboLogo } from '@/components/VergaboLogo'
import { C } from '@/lib/theme'

// Separater, nicht-persistenter Client für den Login-Handshake (Passwort + 2FA):
// Ein signInWithPassword auf dem Haupt-Client würde sofort eine aal1-Session
// speichern — der Auth-Gate in _layout.tsx leitet dann vom Login weg, bevor der
// 6-stellige Code eingegeben werden kann. Deshalb läuft Passwort-Login sowie
// challenge/verify hier, und erst die fertige Session (ohne Faktor: direkt,
// mit Faktor: nach verify auf aal2) wird per setSession an den Haupt-Client
// übergeben. Ab dann navigiert der Auth-Gate wie gewohnt.
const loginClient = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'vergabo-login-handshake',
    },
  },
)

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // 2FA-Code-Schritt (nur für Nutzer mit hinterlegtem TOTP-Faktor)
  const [mfaStep, setMfaStep] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)

  // Fertige Session an den Haupt-Client übergeben — der Auth-Gate in
  // _layout.tsx übernimmt danach die Navigation (anbieter | auftraggeber).
  async function uebernehmeSession(accessToken: string, refreshToken: string) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) {
      Alert.alert('Anmeldung fehlgeschlagen', uebersetzeAuthFehler(error))
    }
  }

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)

    try {
      const { data, error } = await loginClient.auth.signInWithPassword({ email, password })

      if (error || !data.session) {
        Alert.alert('Anmeldung fehlgeschlagen', uebersetzeAuthFehler(error))
        return
      }

      // Wie im Web-Login: Hat der Nutzer einen verifizierten TOTP-Faktor,
      // ist die Session erst aal1 → Code-Schritt nötig (aal1 → aal2).
      const { data: aal } = await loginClient.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        const { data: factors } = await loginClient.auth.mfa.listFactors()
        const totp =
          factors?.totp?.find((f) => f.status === 'verified') ?? factors?.totp?.[0]
        if (totp) {
          setFactorId(totp.id)
          setMfaCode('')
          setMfaError(null)
          setMfaStep(true)
          return
        }
      }

      // Kein Faktor hinterlegt: Login unverändert — Session direkt übergeben.
      await uebernehmeSession(data.session.access_token, data.session.refresh_token)
    } finally {
      setLoading(false)
    }
  }

  // Code prüfen: challenge + verify → Session auf aal2 heben, dann übergeben.
  async function handleMfaVerify() {
    if (!factorId || mfaCode.length !== 6 || mfaBusy) return
    setMfaBusy(true)
    setMfaError(null)

    try {
      const { data: ch, error: chErr } = await loginClient.auth.mfa.challenge({ factorId })
      if (chErr || !ch) {
        setMfaError('Der Code ist ungültig oder abgelaufen.')
        return
      }
      const { data: v, error: vErr } = await loginClient.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: mfaCode,
      })
      if (vErr || !v) {
        setMfaError('Der Code ist ungültig oder abgelaufen.')
        setMfaCode('')
        return
      }
      await uebernehmeSession(v.access_token, v.refresh_token)
    } finally {
      setMfaBusy(false)
    }
  }

  // Abbrechen: angefangene aal1-Sitzung beenden, zurück zum Formular.
  async function handleMfaAbbrechen() {
    setMfaStep(false)
    setMfaCode('')
    setMfaError(null)
    setFactorId(null)
    try {
      // scope 'local': nur die Handshake-Sitzung im Speicher verwerfen.
      // 'global' (Default) würde ALLE Sitzungen des Nutzers widerrufen (z. B. Web).
      await loginClient.auth.signOut({ scope: 'local' })
    } catch {
      // Sitzung existiert nur im Speicher des Handshake-Clients — nicht kritisch.
    }
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

        {mfaStep ? (
          <>
            <Text style={styles.subtitle}>Zwei-Faktor-Bestätigung</Text>
            <Text style={styles.mfaHint}>
              Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.
            </Text>
            <TextInput
              style={styles.codeInput}
              value={mfaCode}
              onChangeText={(t) => setMfaCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={C.muted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              editable={!mfaBusy}
            />
            {mfaError && <Text style={styles.mfaError}>{mfaError}</Text>}
            <Pressable
              style={[styles.button, (mfaCode.length !== 6 || mfaBusy) && styles.buttonDisabled]}
              onPress={handleMfaVerify}
              disabled={mfaCode.length !== 6 || mfaBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: mfaCode.length !== 6 || mfaBusy, busy: mfaBusy }}
            >
              {mfaBusy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Bestätigen</Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleMfaAbbrechen}
              hitSlop={8}
              style={styles.forgotRow}
              disabled={mfaBusy}
              accessibilityRole="button"
            >
              <Text style={styles.forgotLink}>Abbrechen</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>Vergabe einfach gemacht</Text>

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
    // Inputs (z. B. codeInput unten mit letterSpacing: 8 → „E - M a i l").
    letterSpacing: 0,
  },
  mfaHint: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  mfaError: {
    fontSize: 13,
    color: '#9a4a35',
    textAlign: 'center',
  },
  codeInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 28,
    // letterSpacing nur hier (Code-Eingabe) — siehe Hinweis bei styles.input.
    letterSpacing: 8,
    textAlign: 'center',
    color: C.text,
    backgroundColor: C.bg,
    alignSelf: 'center',
    width: 220,
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
