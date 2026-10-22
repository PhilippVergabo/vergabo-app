import type { Dispatch, SetStateAction } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useRouter } from 'expo-router'
import { NACHWEIS_TYP_LABELS, dateiWaehlen, type Kriterium, type PickedFile } from '@/lib/bewerbung'
import { C } from '@/lib/theme'
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
  /**
   * Werden die Eingaben dieses Formulars als Entwurf gesichert? Nur dann darf
   * der Hinweis unten versprechen, dass ein Abstecher zu den Nachweisen die
   * Eingaben nicht kostet (Angebotsabgabe: ja; Bearbeiten: nein).
   */
  eingabenGesichert?: boolean
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
  eingabenGesichert = false,
}: Props) {
  const router = useRouter()

  if (kriterien.length === 0) return null

  // Pflichtkriterien, die nur anzuhaken sind (kein Dokument verlangt) und noch
  // offen sind. Ist keins offen, erübrigt sich der Hinweis.
  const offeneAnhakKriterien = kriterien.filter(
    (k) => k.pflicht && !k.nachweis_erforderlich && !eignungsbestaetigung[k.id],
  )

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
        {/* Bis 22.10.2026 stand hier nur „* Pflichtnachweis" — ein Tester las
            „Nachweis" als „Dokument", lud im Profil Dateien hoch, kam zurück
            und fand die Kästchen weiter leer (die Freigabe durch Vergabo stand
            noch aus). Dass ein Haken genügt, stand nirgends. Wortlaut wie im
            Web (app/auftraege/[id]/bewerben/page.tsx). */}
        {offeneAnhakKriterien.length > 0 ? (
          <View style={eigeneStyles.anhakBox}>
            <Text style={eigeneStyles.anhakTitel}>⚠️ Pflichtangaben noch nicht bestätigt</Text>
            <Text style={eigeneStyles.anhakText}>
              Bestätigen Sie die mit * markierten Angaben durch Anhaken – ein Dokument ist dafür
              nicht nötig. Nachweise, die Sie unter „Eigenerklärungen & Nachweise“ hinterlegt
              haben, werden automatisch angehakt, sobald Vergabo sie geprüft hat.
              {eingabenGesichert ? ' Ihre Eingaben hier bleiben dabei erhalten.' : ''}
            </Text>
            <Pressable
              onPress={() => router.push('/eigenerklarungen')}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={eigeneStyles.anhakLink}>Eigenerklärungen & Nachweise öffnen</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  )
}

// Nur für den Hinweis zu den anzuhakenden Pflichtangaben — der Rest der
// Sektion nutzt die geteilten sektionStyles.
const eigeneStyles = StyleSheet.create({
  anhakBox: {
    backgroundColor: C.warn,
    borderWidth: 1,
    borderColor: '#c879414d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  anhakTitel: { fontSize: 12, fontWeight: '600', color: '#8a4a1e' },
  anhakText: { fontSize: 12, color: '#8a4a1e', lineHeight: 18 },
  anhakLink: {
    fontSize: 12,
    color: '#8a4a1e',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
})
