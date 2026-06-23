import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { AdressAutocomplete } from '@/components/AdressAutocomplete'

const C = {
  bg: '#f5f0e8',
  primary: '#3a5a3e',
  accent: '#c87941',
  text: '#1a1a18',
  muted: '#6b6b60',
  border: '#ddd8cc',
  card: '#ffffff',
  ok: '#e8f0e9',
}

const RECHTSFORMEN = [
  { value: 'einzelunternehmen', label: 'Einzelunternehmen' },
  { value: 'gmbh', label: 'GmbH' },
  { value: 'ug', label: 'UG' },
  { value: 'gbr', label: 'GbR' },
  { value: 'kg', label: 'KG' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

const GEWERKE = [
  { value: 'malerarbeiten', label: '🎨 Malerarbeiten' },
  { value: 'sanitaer', label: '🔧 Sanitär' },
  { value: 'elektro', label: '⚡ Elektro' },
  { value: 'schreiner', label: '🪵 Schreiner' },
  { value: 'dachdecker', label: '🏠 Dachdecker' },
  { value: 'garten', label: '🌿 Garten' },
  { value: 'reinigung', label: '🧹 Reinigung' },
  { value: 'sonstiges', label: '🔨 Sonstiges' },
]

const RADIUS_OPTIONEN = [10, 25, 50, 75, 100]

const PW_REGELN = [
  { label: 'Mindestens 8 Zeichen', test: (p: string) => p.length >= 8 },
  { label: 'Mindestens 1 Großbuchstabe', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Mindestens 1 Zahl', test: (p: string) => /[0-9]/.test(p) },
  { label: 'Mindestens 1 Sonderzeichen', test: (p: string) => /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(p) },
]
function passwordValid(p: string) {
  return PW_REGELN.every((r) => r.test(p))
}

const BUNDESLAND_MAP: Record<string, string> = {
  'Baden-Württemberg': 'bw',
  Bayern: 'by',
  Berlin: 'be',
  Brandenburg: 'bb',
  Bremen: 'hb',
  Hamburg: 'hh',
  Hessen: 'he',
  'Mecklenburg-Vorpommern': 'mv',
  Niedersachsen: 'ni',
  'Nordrhein-Westfalen': 'nw',
  'Rheinland-Pfalz': 'rp',
  Saarland: 'sl',
  Sachsen: 'sn',
  'Sachsen-Anhalt': 'st',
  'Schleswig-Holstein': 'sh',
  Thüringen: 'th',
}

async function plzLookup(plz: string): Promise<{ ort: string; bundesland: string } | null> {
  if (plz.length !== 5) return null
  try {
    const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      return {
        ort: data[0].name,
        bundesland: BUNDESLAND_MAP[data[0].federalState?.name] ?? '',
      }
    }
  } catch {
    /* offline / API-Fehler — Ort dann manuell */
  }
  return null
}

function Auswahl({ label, aktiv, onPress }: { label: string; aktiv: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.option, aktiv ? styles.optionAktiv : styles.optionInaktiv]}
      onPress={onPress}
    >
      <Text style={[styles.optionText, aktiv ? styles.optionTextAktiv : styles.optionTextInaktiv]}>
        {label}
      </Text>
    </Pressable>
  )
}

export default function RegistrierenScreen() {
  const router = useRouter()
  const [schritt, setSchritt] = useState(1)
  const [loading, setLoading] = useState(false)
  const [fertig, setFertig] = useState(false)
  const [agb, setAgb] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firmenname, setFirmenname] = useState('')
  const [inhaberName, setInhaberName] = useState('')
  const [rechtsform, setRechtsform] = useState('')
  const [steuernummer, setSteuernummer] = useState('')
  const [strasse, setStrasse] = useState('')
  const [hausnummer, setHausnummer] = useState('')
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  const [bundesland, setBundesland] = useState('')
  const [koordinaten, setKoordinaten] = useState<{ lat: number; lon: number } | null>(null)
  const [aktionsradius, setAktionsradius] = useState(50)
  const [gewerke, setGewerke] = useState<string[]>([])

  function toggleGewerk(g: string) {
    setGewerke((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }

  async function onPlzChange(value: string) {
    setPlz(value)
    setKoordinaten(null) // manuelle PLZ-Änderung → Auto-Koordinaten verwerfen
    if (value.length === 5) {
      const r = await plzLookup(value)
      if (r) {
        setOrt(r.ort)
        setBundesland(r.bundesland)
      }
    }
  }

  const schritt1Ok = email.trim().length > 0 && passwordValid(password)
  const schritt2Ok =
    firmenname && inhaberName && rechtsform && steuernummer && strasse && hausnummer && plz && ort
  const schritt3Ok = gewerke.length > 0 && plz.length > 0 && agb

  async function handleSubmit() {
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          rolle: 'anbieter',
          firmenname,
          inhaber_name: inhaberName,
          rechtsform,
          steuernummer,
          plz,
          strasse,
          hausnummer,
          ort,
          bundesland,
          // Koordinaten aus der Adresssuche (für präzises Matching); leer = Fallback PLZ-Mittelpunkt
          lat: koordinaten?.lat != null ? String(koordinaten.lat) : '',
          lon: koordinaten?.lon != null ? String(koordinaten.lon) : '',
          aktionsradius_km: String(aktionsradius),
          gewerke: gewerke.join(','),
        },
      },
    })
    setLoading(false)
    if (error) {
      Alert.alert('Registrierung fehlgeschlagen', error.message)
      return
    }
    // Anti-Enumeration: existiert die E-Mail bereits, gibt Supabase einen User
    // OHNE Identities zurück (kein Fehler, keine Mail). Diesen Fall sauber melden.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      Alert.alert(
        'E-Mail bereits registriert',
        'Für diese E-Mail-Adresse besteht schon ein Konto. Bitte melde dich an oder nutze auf vergabo.de „Passwort vergessen".',
      )
      return
    }
    setFertig(true)
  }

  if (fertig) {
    return (
      <View style={[styles.center, { padding: 24, gap: 14 }]}>
        <Text style={{ fontSize: 48 }}>📬</Text>
        <Text style={styles.erfolgTitel}>Fast geschafft!</Text>
        <Text style={styles.erfolgText}>
          Wir haben einen Bestätigungslink an <Text style={{ fontWeight: '700' }}>{email}</Text>{' '}
          gesendet. Bitte bestätige deine E-Mail-Adresse und melde dich danach hier an.
        </Text>
        <Pressable style={[styles.primaryBtn, styles.erfolgBtn]} onPress={() => router.replace('/login')}>
          <Text style={[styles.primaryBtnText, styles.erfolgBtnText]}>Zur Anmeldung</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>vergabo</Text>
        <Text style={styles.subtitle}>Als Anbieter registrieren</Text>

        <View style={styles.progress}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={[styles.progressBar, s <= schritt ? styles.progressAktiv : styles.progressInaktiv]} />
          ))}
        </View>

        {schritt === 1 ? (
          <View style={styles.stepBox}>
            <Text style={styles.stepTitel}>Zugangsdaten</Text>
            <Text style={styles.stepHint}>Schritt 1 von 3</Text>
            <TextInput
              style={styles.input}
              placeholder="E-Mail-Adresse"
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Passwort wählen"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {password.length > 0 ? (
              <View style={styles.pwListe}>
                {PW_REGELN.map((r) => {
                  const ok = r.test(password)
                  return (
                    <Text key={r.label} style={[styles.pwRegel, { color: ok ? C.primary : C.muted }]}>
                      {ok ? '✓' : '○'} {r.label}
                    </Text>
                  )
                })}
              </View>
            ) : null}
            <Pressable
              style={[styles.primaryBtn, !schritt1Ok && styles.btnDisabled]}
              disabled={!schritt1Ok}
              onPress={() => setSchritt(2)}
            >
              <Text style={styles.primaryBtnText}>Weiter</Text>
            </Pressable>
          </View>
        ) : null}

        {schritt === 2 ? (
          <View style={styles.stepBox}>
            <Text style={styles.stepTitel}>Firmendaten</Text>
            <Text style={styles.stepHint}>Schritt 2 von 3</Text>
            <TextInput style={styles.input} placeholder="Firmenname" placeholderTextColor={C.muted} value={firmenname} onChangeText={setFirmenname} />
            <TextInput style={styles.input} placeholder="Name Inhaber" placeholderTextColor={C.muted} value={inhaberName} onChangeText={setInhaberName} />

            <Text style={styles.feldLabel}>Rechtsform</Text>
            <View style={styles.optionWrap}>
              {RECHTSFORMEN.map((r) => (
                <Auswahl key={r.value} label={r.label} aktiv={rechtsform === r.value} onPress={() => setRechtsform(r.value)} />
              ))}
            </View>

            <TextInput style={styles.input} placeholder="Steuernummer" placeholderTextColor={C.muted} value={steuernummer} onChangeText={setSteuernummer} />
            <AdressAutocomplete
              value={strasse}
              onChange={(t) => {
                setStrasse(t)
                setKoordinaten(null)
              }}
              onSelect={(v) => {
                setStrasse(v.strasse)
                if (v.hausnummer) setHausnummer(v.hausnummer)
                if (v.plz) setPlz(v.plz)
                if (v.ort) setOrt(v.ort)
                if (v.bundesland) setBundesland(v.bundesland)
                setKoordinaten(v.lat != null && v.lon != null ? { lat: v.lat, lon: v.lon } : null)
              }}
              placeholder="Straße (mit Vorschlägen)"
            />
            <View style={styles.zeile}>
              <TextInput
                style={[styles.input, { width: 90 }]}
                placeholder="Nr."
                placeholderTextColor={C.muted}
                value={hausnummer}
                onChangeText={(t) => {
                  setHausnummer(t)
                  setKoordinaten(null)
                }}
              />
              <TextInput style={[styles.input, { width: 110 }]} placeholder="PLZ" placeholderTextColor={C.muted} value={plz} onChangeText={onPlzChange} keyboardType="number-pad" maxLength={5} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ort" placeholderTextColor={C.muted} value={ort} onChangeText={setOrt} />
            </View>

            <View style={styles.zeile}>
              <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => setSchritt(1)}>
                <Text style={styles.secondaryBtnText}>Zurück</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, { flex: 1 }, !schritt2Ok && styles.btnDisabled]} disabled={!schritt2Ok} onPress={() => setSchritt(3)}>
                <Text style={styles.primaryBtnText}>Weiter</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {schritt === 3 ? (
          <View style={styles.stepBox}>
            <Text style={styles.stepTitel}>Gewerke & Standort</Text>
            <Text style={styles.stepHint}>Schritt 3 von 3</Text>

            <Text style={styles.feldLabel}>Welche Gewerke bietest du an?</Text>
            <View style={styles.optionWrap}>
              {GEWERKE.map((g) => (
                <Auswahl key={g.value} label={g.label} aktiv={gewerke.includes(g.value)} onPress={() => toggleGewerk(g.value)} />
              ))}
            </View>

            <Text style={styles.feldLabel}>Aktionsradius: {aktionsradius} km</Text>
            <View style={styles.optionWrap}>
              {RADIUS_OPTIONEN.map((r) => (
                <Auswahl key={r} label={`${r} km`} aktiv={aktionsradius === r} onPress={() => setAktionsradius(r)} />
              ))}
            </View>

            <Pressable style={styles.agbRow} onPress={() => setAgb((v) => !v)}>
              <Text style={agb ? styles.checkOk : styles.checkEmpty}>{agb ? '✓' : '○'}</Text>
              <Text style={styles.agbText}>
                Ich habe die{' '}
                <Text style={styles.link} onPress={() => Linking.openURL('https://www.vergabo.de/agb')}>
                  AGB
                </Text>{' '}
                und{' '}
                <Text style={styles.link} onPress={() => Linking.openURL('https://www.vergabo.de/datenschutz')}>
                  Datenschutzerklärung
                </Text>{' '}
                gelesen und akzeptiere diese.
              </Text>
            </Pressable>

            <View style={styles.zeile}>
              <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => setSchritt(2)}>
                <Text style={styles.secondaryBtnText}>Zurück</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, { flex: 1 }, (!schritt3Ok || loading) && styles.btnDisabled]} disabled={!schritt3Ok || loading} onPress={handleSubmit}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Registrieren</Text>}
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable onPress={() => router.replace('/login')} hitSlop={8} style={styles.loginLink}>
          <Text style={styles.loginLinkText}>Schon ein Konto? Zur Anmeldung</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  brand: { fontSize: 30, fontWeight: '700', color: C.primary, textAlign: 'center', letterSpacing: 1, marginTop: 8 },
  subtitle: { fontSize: 14, color: C.muted, textAlign: 'center' },
  progress: { flexDirection: 'row', gap: 8, marginVertical: 6 },
  progressBar: { height: 6, flex: 1, borderRadius: 3 },
  progressAktiv: { backgroundColor: C.accent },
  progressInaktiv: { backgroundColor: C.border },
  stepBox: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 18, gap: 12 },
  stepTitel: { fontSize: 18, fontWeight: '700', color: C.text },
  stepHint: { fontSize: 13, color: C.muted, marginTop: -8 },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: C.text,
  },
  zeile: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  feldLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 4 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  optionAktiv: { backgroundColor: '#fdf3ea', borderColor: C.accent },
  optionInaktiv: { backgroundColor: C.card, borderColor: C.border },
  optionText: { fontSize: 13, fontWeight: '600' },
  optionTextAktiv: { color: C.accent },
  optionTextInaktiv: { color: C.muted },
  pwListe: { gap: 3, marginTop: -4 },
  pwRegel: { fontSize: 12 },
  agbRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 4 },
  checkOk: { fontSize: 16, color: C.primary, fontWeight: '700' },
  checkEmpty: { fontSize: 16, color: C.muted },
  agbText: { flex: 1, fontSize: 13, color: C.muted, lineHeight: 19 },
  link: { color: C.accent, textDecorationLine: 'underline' },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Erfolgs-Screen: Button füllt die Breite, damit der Text mittig und nicht gedrängt sitzt
  erfolgBtn: { alignSelf: 'stretch', paddingVertical: 16, paddingHorizontal: 28, marginTop: 10 },
  erfolgBtnText: { fontSize: 16 },
  secondaryBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  secondaryBtnText: { color: C.muted, fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  loginLink: { alignItems: 'center', paddingVertical: 8 },
  loginLinkText: { fontSize: 14, color: C.primary, fontWeight: '600' },
  erfolgTitel: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  erfolgText: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22 },
})
