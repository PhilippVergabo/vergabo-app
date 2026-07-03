import { Text, TextInput, View } from 'react-native'
import { C } from '@/lib/theme'
import { sektionStyles as styles } from './sektionStyles'

type Props = {
  ausfuehrungszeitraum: string
  setAusfuehrungszeitraum: (v: string) => void
  beschreibung: string
  setBeschreibung: (v: string) => void
  referenzen: string
  setReferenzen: (v: string) => void
}

// Basis-Textfelder des Angebots (Ausführungszeitraum, Anmerkung, Referenzen).
// 1:1 aus bewerben.tsx/bearbeiten.tsx verschoben (dort identisch). Fragment statt
// Wrapper-View, damit das gap der ScrollView weiterhin zwischen den Feldern greift.
export function BasisFelder({
  ausfuehrungszeitraum,
  setAusfuehrungszeitraum,
  beschreibung,
  setBeschreibung,
  referenzen,
  setReferenzen,
}: Props) {
  return (
    <>
      {/* Ausführungszeitraum */}
      <View style={styles.field}>
        <Text style={styles.label}>Ausführungszeitraum</Text>
        <TextInput
          style={styles.input}
          value={ausfuehrungszeitraum}
          onChangeText={setAusfuehrungszeitraum}
          placeholder="z. B. 01.08. – 15.08.2026"
          placeholderTextColor={C.muted}
        />
      </View>

      {/* Anmerkung (optional — wie im Web-Wizard; Server akzeptiert leeres Feld) */}
      <View style={styles.field}>
        <Text style={styles.label}>Anmerkung (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={beschreibung}
          onChangeText={setBeschreibung}
          placeholder="Optional: kurze Anmerkung zu Ihrem Angebot (z. B. Besonderheiten, Hinweise) …"
          placeholderTextColor={C.muted}
          multiline
          numberOfLines={4}
        />
      </View>

      {/* Referenzen */}
      <View style={styles.field}>
        <Text style={styles.label}>Referenzen (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={referenzen}
          onChangeText={setReferenzen}
          placeholder="Ähnliche Projekte …"
          placeholderTextColor={C.muted}
          multiline
          numberOfLines={3}
        />
      </View>
    </>
  )
}
