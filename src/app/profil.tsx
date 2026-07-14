import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { bundeslandKuerzel } from '@/lib/adressSuche'
import { GEWERK_LABELS } from '@/lib/labels'
import { C } from '@/lib/theme'

// Anbieter-Profil bearbeiten — Pendant zu app/dashboard/anbieter/profil im Web.
// Direktes Supabase-Update auf anbieter_profile (Own-Row-RLS), nur eigene Zeile.
//
// Koordinaten (lat/lon): Es gibt hier bewusst KEINE Adress-Autocomplete. Beim
// Laden vorhandene exakte Koordinaten bleiben erhalten, solange die Adresse
// unverändert ist; jede manuelle Änderung an Straße/PLZ/Ort verwirft sie
// (→ null). Das Matching fällt dann serverseitig auf den PLZ-Mittelpunkt
// zurück — wie im Web bei manueller Adressänderung.

const RECHTSFORMEN = [
  { value: 'einzelunternehmen', label: 'Einzelunternehmen' },
  { value: 'gmbh', label: 'GmbH' },
  { value: 'ug', label: 'UG' },
  { value: 'gbr', label: 'GbR' },
  { value: 'kg', label: 'KG' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

// Wie im Web-Profil (dort 10–200 km; die Registrierung in der App endet bei 100).
const RADIUS_OPTIONEN = [10, 25, 50, 75, 100, 150, 200]

// PLZ → Ort + Bundesland-Kürzel via OpenPLZ (wie in registrieren.tsx).
async function plzLookup(plz: string): Promise<{ ort: string; bundesland: string } | null> {
  if (plz.length !== 5) return null
  try {
    const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      return {
        ort: data[0].name,
        bundesland: bundeslandKuerzel(data[0].federalState?.name),
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
      accessibilityRole="button"
      accessibilityState={{ selected: aktiv }}
    >
      <Text style={[styles.optionText, aktiv ? styles.optionTextAktiv : styles.optionTextInaktiv]}>
        {label}
      </Text>
    </Pressable>
  )
}

export default function ProfilScreen() {
  const [laden, setLaden] = useState(true)
  const [speichern, setSpeichern] = useState(false)
  const [ladeFehler, setLadeFehler] = useState(false)

  const [firmenname, setFirmenname] = useState('')
  const [inhaberName, setInhaberName] = useState('')
  const [rechtsform, setRechtsform] = useState('')
  const [steuernummer, setSteuernummer] = useState('')
  const [strasse, setStrasse] = useState('')
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  const [bundesland, setBundesland] = useState('')
  const [aktionsradius, setAktionsradius] = useState(50)
  const [gewerke, setGewerke] = useState<string[]>([])
  // Exakte Koordinaten aus der DB; werden bei Adressänderung verworfen (s. o.).
  const [koordinaten, setKoordinaten] = useState<{ lat: number; lon: number } | null>(null)
  // Erhaltene Bewertungen (nur Anzeige; gepflegt von /api/auftrag-abschliessen)
  const [bewertung, setBewertung] = useState<{ avg: number | null; anzahl: number }>({
    avg: null,
    anzahl: 0,
  })
  // Geschäftsdaten für Angebots-PDFs
  const [ustId, setUstId] = useState('')
  const [bankname, setBankname] = useState('')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')

  useEffect(() => {
    async function ladeProfil() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) {
        setLadeFehler(true)
        setLaden(false)
        return
      }
      const { data: profil, error } = await supabase
        .from('anbieter_profile')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error || !profil) {
        setLadeFehler(true)
        setLaden(false)
        return
      }
      setFirmenname(profil.firmenname ?? '')
      setInhaberName(profil.inhaber_name ?? '')
      setBewertung({ avg: profil.bewertung_avg ?? null, anzahl: profil.anzahl_bewertungen ?? 0 })
      setRechtsform(profil.rechtsform ?? '')
      setSteuernummer(profil.steuernummer ?? '')
      // Straße + Hausnummer in EIN Feld (wie im Web-Profil); Altdaten mit
      // separater Hausnummer bleiben sichtbar, die Spalte wird nicht mehr genutzt.
      setStrasse([profil.strasse, profil.hausnummer].filter(Boolean).join(' '))
      setPlz(profil.plz ?? '')
      setOrt(profil.ort ?? '')
      setBundesland(profil.bundesland ?? '')
      setAktionsradius(profil.aktionsradius_km ?? 50)
      setGewerke(Array.isArray(profil.gewerke) ? profil.gewerke : [])
      setKoordinaten(
        profil.lat != null && profil.lon != null ? { lat: profil.lat, lon: profil.lon } : null,
      )
      setUstId(profil.ust_id ?? '')
      setBankname(profil.bankname ?? '')
      setIban(profil.iban ?? '')
      setBic(profil.bic ?? '')
      setLaden(false)
    }
    void ladeProfil()
  }, [])

  function toggleGewerk(g: string) {
    setGewerke((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }

  async function onPlzChange(value: string) {
    setPlz(value)
    setKoordinaten(null) // manuelle PLZ-Änderung → exakte Koordinaten verwerfen
    if (value.length === 5) {
      const r = await plzLookup(value)
      if (r) {
        setOrt(r.ort)
        setBundesland(r.bundesland)
      }
    }
  }

  const eingabenOk = firmenname.trim().length > 0 && plz.length === 5 && gewerke.length > 0

  async function handleSpeichern() {
    if (speichern) return
    setSpeichern(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) {
        Alert.alert('Nicht angemeldet', 'Bitte melden Sie sich erneut an.')
        return
      }
      const { error } = await supabase
        .from('anbieter_profile')
        .update({
          firmenname: firmenname.trim(),
          inhaber_name: inhaberName.trim(),
          rechtsform,
          steuernummer: steuernummer.trim(),
          strasse: strasse.trim(),
          hausnummer: '',
          plz,
          ort: ort.trim(),
          bundesland,
          // Exakte Koordinaten nur, wenn die Adresse unverändert blieb; sonst
          // null → Matching fällt auf den PLZ-Mittelpunkt zurück.
          lat: koordinaten?.lat ?? null,
          lon: koordinaten?.lon ?? null,
          aktionsradius_km: aktionsradius,
          gewerke,
          ust_id: ustId.trim() || null,
          bankname: bankname.trim() || null,
          iban: iban.trim() || null,
          bic: bic.trim() || null,
        })
        .eq('user_id', userId)
      if (error) {
        Alert.alert('Speichern fehlgeschlagen', 'Beim Speichern ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.')
        return
      }
      Alert.alert('Gespeichert', 'Ihre Profildaten wurden gespeichert.')
    } catch {
      Alert.alert(
        'Speichern fehlgeschlagen',
        'Netzwerkfehler — bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
      )
    } finally {
      setSpeichern(false)
    }
  }

  if (laden) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} />
      </View>
    )
  }

  if (ladeFehler) {
    return (
      <View style={[styles.center, { padding: 24 }]}>
        <Text style={styles.fehlerText}>
          Ihr Profil konnte nicht geladen werden. Bitte versuchen Sie es später erneut.
        </Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Diese Daten sehen Auftraggeber, wenn Sie ein Angebot abgeben.
        </Text>

        {/* Erhaltene Bewertungen (nur wenn vorhanden) */}
        {bewertung.anzahl > 0 && bewertung.avg != null ? (
          <View style={styles.bewertungCard}>
            <Text style={styles.bewertungWert}>
              ★ {bewertung.avg.toFixed(1).replace('.', ',')}
            </Text>
            <Text style={styles.bewertungInfo}>
              Ihre Bewertung aus {bewertung.anzahl}{' '}
              {bewertung.anzahl === 1 ? 'abgeschlossenen Auftrag' : 'abgeschlossenen Aufträgen'} –
              sichtbar für Auftraggeber
            </Text>
          </View>
        ) : null}

        {/* Firmendaten */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Firmendaten</Text>

          <Text style={styles.feldLabel}>Firmenname</Text>
          <TextInput
            style={styles.input}
            value={firmenname}
            onChangeText={setFirmenname}
            placeholder="Firmenname"
            placeholderTextColor={C.muted}
          />

          <Text style={styles.feldLabel}>Inhaber/in</Text>
          <TextInput
            style={styles.input}
            value={inhaberName}
            onChangeText={setInhaberName}
            placeholder="Name Inhaber/in"
            placeholderTextColor={C.muted}
          />

          <Text style={styles.feldLabel}>Rechtsform</Text>
          <View style={styles.optionWrap}>
            {RECHTSFORMEN.map((r) => (
              <Auswahl
                key={r.value}
                label={r.label}
                aktiv={rechtsform === r.value}
                onPress={() => setRechtsform(r.value)}
              />
            ))}
          </View>

          <Text style={styles.feldLabel}>Steuernummer</Text>
          <TextInput
            style={styles.input}
            value={steuernummer}
            onChangeText={setSteuernummer}
            placeholder="Steuernummer"
            placeholderTextColor={C.muted}
          />
        </View>

        {/* Standort & Einsatzgebiet */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Standort & Einsatzgebiet</Text>

          <Text style={styles.feldLabel}>Straße und Hausnummer</Text>
          <TextInput
            style={styles.input}
            value={strasse}
            onChangeText={(t) => {
              setStrasse(t)
              setKoordinaten(null)
            }}
            placeholder="Musterstraße 12a"
            placeholderTextColor={C.muted}
          />

          <View style={styles.zeile}>
            <View style={{ width: 110 }}>
              <Text style={styles.feldLabel}>PLZ</Text>
              <TextInput
                style={styles.input}
                value={plz}
                onChangeText={onPlzChange}
                placeholder="12345"
                placeholderTextColor={C.muted}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.feldLabel}>Ort</Text>
              <TextInput
                style={styles.input}
                value={ort}
                onChangeText={(t) => {
                  setOrt(t)
                  setKoordinaten(null)
                }}
                placeholder="Wird per PLZ ausgefüllt"
                placeholderTextColor={C.muted}
              />
            </View>
          </View>
          <Text style={styles.hinweis}>
            Bei einer Adressänderung wird Ihr Standort für passende Ausschreibungen anhand der PLZ
            neu bestimmt.
          </Text>

          <Text style={styles.feldLabel}>Aktionsradius: {aktionsradius} km</Text>
          <View style={styles.optionWrap}>
            {RADIUS_OPTIONEN.map((r) => (
              <Auswahl
                key={r}
                label={`${r} km`}
                aktiv={aktionsradius === r}
                onPress={() => setAktionsradius(r)}
              />
            ))}
          </View>
        </View>

        {/* Gewerke */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gewerke</Text>
          <View style={styles.optionWrap}>
            {Object.entries(GEWERK_LABELS).map(([value, label]) => (
              <Auswahl
                key={value}
                label={label}
                aktiv={gewerke.includes(value)}
                onPress={() => toggleGewerk(value)}
              />
            ))}
          </View>
          {gewerke.length === 0 ? (
            <Text style={styles.warnung}>Bitte wählen Sie mindestens ein Gewerk aus.</Text>
          ) : null}
        </View>

        {/* Geschäftsdaten für Angebote */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Geschäftsdaten für Angebote</Text>
          <Text style={styles.hinweis}>Werden auf erzeugten Angebots-PDFs verwendet.</Text>

          <Text style={styles.feldLabel}>USt-ID (optional)</Text>
          <TextInput
            style={styles.input}
            value={ustId}
            onChangeText={setUstId}
            placeholder="DE123456789"
            placeholderTextColor={C.muted}
            autoCapitalize="characters"
          />

          <Text style={styles.feldLabel}>Bankverbindung (optional)</Text>
          <TextInput
            style={styles.input}
            value={bankname}
            onChangeText={setBankname}
            placeholder="Bankname"
            placeholderTextColor={C.muted}
          />
          <TextInput
            style={styles.input}
            value={iban}
            onChangeText={(t) => setIban(t.toUpperCase())}
            placeholder="IBAN: DE00 0000 0000 0000 0000 00"
            placeholderTextColor={C.muted}
            autoCapitalize="characters"
          />
          <TextInput
            style={styles.input}
            value={bic}
            onChangeText={(t) => setBic(t.toUpperCase())}
            placeholder="BIC: DEUTDEDB"
            placeholderTextColor={C.muted}
            autoCapitalize="characters"
          />
        </View>

        <Pressable
          style={[styles.primaryBtn, (!eingabenOk || speichern) && styles.btnDisabled]}
          disabled={!eingabenOk || speichern}
          onPress={() => void handleSpeichern()}
          accessibilityRole="button"
          accessibilityState={{ disabled: !eingabenOk || speichern, busy: speichern }}
        >
          {speichern ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Speichern</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  intro: { fontSize: 13, color: C.muted, lineHeight: 18 },
  bewertungCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0a83c66',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bewertungWert: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e0a83c',
  },
  bewertungInfo: {
    flex: 1,
    fontSize: 12,
    color: C.muted,
    lineHeight: 17,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  feldLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 4 },
  input: {
    backgroundColor: C.field,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: C.text,
  },
  zeile: { flexDirection: 'row', gap: 8 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  optionAktiv: { backgroundColor: C.warn, borderColor: C.accent },
  optionInaktiv: { backgroundColor: C.card, borderColor: C.border },
  optionText: { fontSize: 13, fontWeight: '600' },
  optionTextAktiv: { color: C.accent },
  optionTextInaktiv: { color: C.muted },
  hinweis: { fontSize: 12, color: C.muted, lineHeight: 17 },
  warnung: { fontSize: 12, color: C.accent },
  fehlerText: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22 },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
})
