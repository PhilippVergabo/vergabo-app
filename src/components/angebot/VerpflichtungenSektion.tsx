import type { Dispatch, SetStateAction } from 'react'
import { Pressable, Text, View } from 'react-native'
import { sektionStyles as styles } from './sektionStyles'

type Props = {
  verpflichtungen: { titel: string; text: string }[]
  bestaetigt: boolean[]
  setBestaetigt: Dispatch<SetStateAction<boolean[]>>
  offen: Record<number, boolean>
  setOffen: Dispatch<SetStateAction<Record<number, boolean>>>
}

// Sektion „Verpflichtungserklärungen": Checkbox je Erklärung + auf-/zuklappbarer
// Volltext. 1:1 aus bewerben.tsx/bearbeiten.tsx verschoben (dort identisch).
export function VerpflichtungenSektion({
  verpflichtungen,
  bestaetigt,
  setBestaetigt,
  offen,
  setOffen,
}: Props) {
  if (verpflichtungen.length === 0) return null

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Verpflichtungserklärungen</Text>
      <View style={{ gap: 8 }}>
        {verpflichtungen.map((v, i) => {
          const checked = !!bestaetigt[i]
          return (
            <View
              key={i}
              style={[styles.kriteriumCol, checked ? styles.kriteriumOk : styles.kriteriumNeutral]}
            >
              <Pressable
                style={styles.verpflHead}
                onPress={() =>
                  setBestaetigt((prev) => prev.map((b, j) => (j === i ? !b : b)))
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={v.titel}
              >
                <Text style={checked ? styles.checkOk : styles.checkEmpty}>
                  {checked ? '✓' : '○'}
                </Text>
                <Text style={[styles.kriteriumText, { flex: 1 }]}>
                  {v.titel}
                  <Text style={styles.stern}> *</Text>
                </Text>
              </Pressable>
              <Pressable onPress={() => setOffen((prev) => ({ ...prev, [i]: !prev[i] }))}>
                <Text style={styles.textToggle}>
                  {offen[i] ? 'Text ausblenden' : 'Text anzeigen'}
                </Text>
              </Pressable>
              {offen[i] ? <Text style={styles.verpflText}>{v.text}</Text> : null}
            </View>
          )
        })}
        <Text style={styles.hint}>* Alle Erklärungen sind verbindlich zu bestätigen.</Text>
      </View>
    </View>
  )
}
