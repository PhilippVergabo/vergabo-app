import type { Dispatch, SetStateAction } from 'react'
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { dateiWaehlen, type PickedFile } from '@/lib/bewerbung'
import { sektionStyles as styles } from './sektionStyles'

type Props = {
  anhaenge: PickedFile[]
  setAnhaenge: Dispatch<SetStateAction<PickedFile[]>>
  /** Bearbeiten-Screen nutzt „Weitere Anhänge (optional)". */
  titel?: string
  /** Nur Bearbeiten-Screen: zusätzlicher Style des Upload-Buttons (marginTop: 6). */
  uploadBtnStyle?: StyleProp<ViewStyle>
}

// Sektion „Anhänge": freie Datei-Anhänge zum Angebot. 1:1 aus
// bewerben.tsx/bearbeiten.tsx verschoben; Label + Button-Abstand weichen ab.
export function AnhaengeSektion({
  anhaenge,
  setAnhaenge,
  titel = 'Anhänge (optional)',
  uploadBtnStyle,
}: Props) {
  async function anhangWaehlen() {
    const f = await dateiWaehlen()
    // Duplikate nach Dateiname überspringen (wie im Web): gleicher Name würde
    // beim Upload denselben Storage-Pfad treffen und die Datei überschreiben.
    if (f) setAnhaenge((prev) => (prev.some((p) => p.name === f.name) ? prev : [...prev, f]))
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{titel}</Text>
      <Pressable style={[styles.uploadBtn, uploadBtnStyle]} onPress={anhangWaehlen}>
        <Text style={styles.uploadBtnText}>📎 Datei hinzufügen</Text>
      </Pressable>
      {anhaenge.length > 0 ? (
        <View style={{ gap: 4, marginTop: 8 }}>
          {anhaenge.map((f, i) => (
            <View key={`${f.name}-${i}`} style={styles.dateiRow}>
              <Text style={styles.dateiName}>📄 {f.name}</Text>
              <Pressable onPress={() => setAnhaenge((prev) => prev.filter((_, j) => j !== i))}>
                <Text style={styles.entfernen}>Entfernen</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.hint}>Erlaubt: PDF, PNG, JPG, DOCX, XLSX · max. 15 MB</Text>
    </View>
  )
}
