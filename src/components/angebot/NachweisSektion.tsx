import type { Dispatch, SetStateAction } from 'react'
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { NACHWEIS_TYP_LABELS, dateiWaehlen, type Kriterium, type PickedFile } from '@/lib/bewerbung'
import { sektionStyles as styles } from './sektionStyles'

type Props = {
  kriterien: Kriterium[]
  eignungsbestaetigung: Record<string, boolean>
  setEignungsbestaetigung: Dispatch<SetStateAction<Record<string, boolean>>>
  nachweisProfilMatch: Record<string, string | null>
  nachweisDateien: Record<string, PickedFile>
  setNachweisDateien: Dispatch<SetStateAction<Record<string, PickedFile>>>
  /** Nur Bearbeiten-Screen: bereits gespeicherte Nachweise (Quelle der Ersteinreichung). */
  nachweisVorhanden?: Record<string, { quelle: 'profil' | 'upload' | null }>
  /** Nur Bearbeiten-Screen: zusätzlicher Style der Upload-Buttons (marginTop: 6). */
  uploadBtnStyle?: StyleProp<ViewStyle>
}

// Sektion „Eignungsnachweis": Profil-Treffer, Datei-Upload je Kriterium und
// einfache Bestätigungs-Checkboxen. 1:1 aus bewerben.tsx/bearbeiten.tsx verschoben;
// die Abweichungen des Bearbeiten-Screens laufen über die optionalen Props.
export function NachweisSektion({
  kriterien,
  eignungsbestaetigung,
  setEignungsbestaetigung,
  nachweisProfilMatch,
  nachweisDateien,
  setNachweisDateien,
  nachweisVorhanden,
  uploadBtnStyle,
}: Props) {
  if (kriterien.length === 0) return null

  async function nachweisWaehlen(kriteriumId: string) {
    const f = await dateiWaehlen()
    if (f) setNachweisDateien((prev) => ({ ...prev, [kriteriumId]: f }))
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Eignungsnachweis</Text>
      <View style={{ gap: 8 }}>
        {kriterien.map((k) => {
          if (k.nachweis_erforderlich) {
            const profilId = nachweisProfilMatch[k.id]
            const datei = nachweisDateien[k.id]
            // Nur Bearbeiten-Screen: Nachweis wurde bei der Ersteinreichung bereits hochgeladen.
            const vorhandenUpload =
              !profilId && !datei && nachweisVorhanden?.[k.id]?.quelle === 'upload'
            if (profilId) {
              return (
                <View key={k.id} style={[styles.kriterium, styles.kriteriumOk]}>
                  <Text style={styles.checkOk}>✓</Text>
                  <Text style={styles.kriteriumText}>
                    {k.text}
                    {k.pflicht ? <Text style={styles.stern}> *</Text> : null}
                  </Text>
                  <Text style={styles.tag}>Aus Profil</Text>
                </View>
              )
            }
            return (
              <View
                key={k.id}
                style={[
                  styles.kriteriumCol,
                  datei || vorhandenUpload ? styles.kriteriumOk : styles.kriteriumWarn,
                ]}
              >
                <Text style={styles.kriteriumText}>
                  {k.text}
                  {k.pflicht ? <Text style={styles.stern}> *</Text> : null}
                </Text>
                {datei ? (
                  <View style={styles.dateiRow}>
                    <Text style={styles.dateiName}>✓ {datei.name}</Text>
                    <Pressable
                      onPress={() =>
                        setNachweisDateien((prev) => {
                          const n = { ...prev }
                          delete n[k.id]
                          return n
                        })
                      }
                    >
                      <Text style={styles.entfernen}>Entfernen</Text>
                    </Pressable>
                  </View>
                ) : vorhandenUpload ? (
                  <View>
                    <Text style={styles.dateiName}>✓ Nachweis bereits hochgeladen</Text>
                    <Pressable
                      style={[styles.uploadBtn, uploadBtnStyle]}
                      onPress={() => nachweisWaehlen(k.id)}
                    >
                      <Text style={styles.uploadBtnText}>📎 Anderen Nachweis hochladen</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View>
                    <Pressable
                      style={[styles.uploadBtn, uploadBtnStyle]}
                      onPress={() => nachweisWaehlen(k.id)}
                    >
                      <Text style={styles.uploadBtnText}>📎 Nachweis hochladen</Text>
                    </Pressable>
                    {k.nachweis_typ ? (
                      <Text style={styles.erwartet}>
                        Erwartet: {NACHWEIS_TYP_LABELS[k.nachweis_typ] ?? k.nachweis_typ}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            )
          }
          const checked = !!eignungsbestaetigung[k.id]
          return (
            <Pressable
              key={k.id}
              style={[styles.kriterium, checked ? styles.kriteriumOk : styles.kriteriumNeutral]}
              onPress={() =>
                setEignungsbestaetigung((prev) => ({ ...prev, [k.id]: !prev[k.id] }))
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={k.text}
            >
              <Text style={checked ? styles.checkOk : styles.checkEmpty}>{checked ? '✓' : '○'}</Text>
              <Text style={styles.kriteriumText}>
                {k.text}
                {k.pflicht ? <Text style={styles.stern}> *</Text> : null}
              </Text>
            </Pressable>
          )
        })}
        <Text style={styles.hint}>* Pflichtnachweis</Text>
      </View>
    </View>
  )
}
