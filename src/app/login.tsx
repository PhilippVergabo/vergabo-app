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
import { API_URL } from '@/lib/config'
import { PasswortFeld } from '@/components/PasswortFeld'
import { VergaboLogo } from '@/components/VergaboLogo'
import { captchaFehlerText, fordereCaptchaToken } from '@/components/Turnstile'
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

// Fehlercodes der Backend-Route in verständliche Meldungen übersetzen.
// Die Codes spiegeln app/api/app-auth/login im Web-Repo.
function loginFehlerText(inhalt: { error?: string; resetIn?: number }): string {
  if (inhalt.error === 'rate_limited') {
    const minuten = inhalt.resetIn ?? 15
    return `Zu viele Anmeldeversuche. Bitte versuchen Sie es in ${minuten} Minute${minuten === 1 ? '' : 'n'} erneut.`
  }
  if (inhalt.error === 'auth_unavailable') {
    return 'Der Anmeldedienst ist momentan nicht erreichbar. Bitte versuchen Sie es später erneut.'
  }
  // email_not_confirmed und invalid_credentials teilen sich die Texte mit dem
  // direkten Supabase-Weg — dieselbe Formulierung wie bisher.
  return uebersetzeAuthFehler({ code: inhalt.error })
}

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

    // Wie im Web-Login (app/api/auth/login): Leerzeichen und Groß-/Kleinschreibung
    // normalisieren. Ein vom Tippen oder Ausfüllen angehängtes Leerzeichen führte
    // sonst serverseitig zu „Invalid login credentials" — also zur Meldung
    // „falsches Passwort", obwohl das Passwort stimmt.
    const emailNormalisiert = email.trim().toLowerCase()

    // Anmeldung über unser Backend statt direkt gegen Supabase: Nur so greift
    // für die App dasselbe Rate-Limit (IP + E-Mail) wie fürs Web. Vorher stand
    // vor dem App-Login kein eigener Schutz — der Anon-Key ist aus dem Bundle
    // auslesbar, und das Rate-Limit der Web-Route wurde nie durchlaufen.
    const anmelden = (captchaToken?: string) =>
      fetch(`${API_URL}/api/app-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNormalisiert, password, captchaToken }),
      })

    try {
      let antwort = await anmelden()
      let inhalt = (await antwort.json().catch(() => ({}))) as {
        error?: string
        resetIn?: number
        access_token?: string
        refresh_token?: string
      }

      // CAPTCHA nur, wenn der Supabase-Schalter es verlangt: Sicherheitsprüfung
      // holen und den Aufruf einmal wiederholen. Ist der Schalter aus, kommt
      // dieser Zweig nie zum Tragen — dann bleibt der Login ein einziger Aufruf.
      if (inhalt.error === 'captcha_required') {
        const captcha = await fordereCaptchaToken()
        if (!captcha.ok) {
          Alert.alert('Anmeldung fehlgeschlagen', captchaFehlerText(captcha.grund))
          return
        }
        antwort = await anmelden(captcha.token)
        inhalt = (await antwort.json().catch(() => ({}))) as typeof inhalt
      }

      if (!antwort.ok || !inhalt.access_token || !inhalt.refresh_token) {
        Alert.alert('Anmeldung fehlgeschlagen', loginFehlerText(inhalt))
        return
      }

      // Tokens auf den Handshake-Client setzen — ab hier läuft der 2FA-Schritt
      // unverändert wie zuvor.
      const { data, error } = await loginClient.auth.setSession({
        access_token: inhalt.access_token,
        refresh_token: inhalt.refresh_token,
      })
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
    } catch {
      // fetch wirft nur bei Netzwerkfehlern — ohne diesen Zweig bliebe der
      // Fehler unbehandelt und der Nutzer ohne Rückmeldung.
      Alert.alert(
        'Anmeldung fehlgeschlagen',
        'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.',
      )
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
              // Ohne diese beiden Angaben bietet iOS über der Tastatur keinen
              // Verifizierungscode an — das Feld muss sich als Einmalcode zu
              // erkennen geben.
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
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
            <PasswortFeld
              style={styles.input}
              placeholder="Passwort"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
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
              // Eingetippte E-Mail mitnehmen — nach einem gescheiterten Login
              // ist sie im Formular schon da und muss nicht erneut getippt werden.
              onPress={() =>
                router.push({
                  pathname: '/passwort-vergessen',
                  params: { email: email.trim() },
                })
              }
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
