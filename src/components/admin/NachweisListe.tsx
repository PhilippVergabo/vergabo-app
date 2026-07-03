import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { erklaerungLabel } from '@/lib/eigenerklarungTypen'
import { C } from '@/lib/theme'
import { NachweisBadge, type AdminDokument } from './NachweisBadge'

type Props = {
  /** Anbieter-Name — nur für das Accessibility-Label des Toggles. */
  titel: string
  /** null = für diesen Anbieter noch nicht geladen (Lazy-Load beim ersten Öffnen). */
  dokumente: AdminDokument[] | null
  offen: boolean
  laedt: boolean
  onToggle: () => void
  /** id des Dokuments, dessen Freigabe/Ablehnung gerade läuft (null = keine). */
  busyDokId: string | null
  onEntscheiden: (dok: AdminDokument, aktion: 'freigeben' | 'ablehnen') => void
}

// Auf-/zuklappbare Nachweis-Liste eines Anbieters (nur tab === 'anbieter').
// 1:1 aus admin.tsx verschoben; Laden/Cachen + API-Aufrufe bleiben im Screen.
export function NachweisListe({
  titel,
  dokumente,
  offen,
  laedt,
  onToggle,
  busyDokId,
  onEntscheiden,
}: Props) {
  return (
    <View style={styles.nachweisBereich}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Nachweise von ${titel} ${offen ? 'ausblenden' : 'anzeigen'}`}
      >
        <Text style={styles.nachweisToggle}>
          {offen ? '▾ Nachweise ausblenden' : '▸ Nachweise anzeigen'}
        </Text>
      </Pressable>
      {offen ? (
        laedt ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 8 }} />
        ) : dokumente != null ? (
          dokumente.length === 0 ? (
            <Text style={[styles.meta, { marginTop: 8 }]}>Keine Nachweise hinterlegt.</Text>
          ) : (
            dokumente.map((d) => {
              const unentschieden = !d.admin_verifiziert && !d.admin_abgelehnt
              const busy = busyDokId === d.id
              return (
                <View key={d.id} style={styles.dokEintrag}>
                  <View style={styles.dokRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.dokTyp}>{erklaerungLabel(d.typ)}</Text>
                      <Text style={styles.dokDatei} numberOfLines={1}>
                        {d.dateiname ? `📎 ${d.dateiname}` : 'keine Datei hinterlegt'}
                      </Text>
                    </View>
                    <NachweisBadge d={d} />
                    {d.url ? (
                      <Pressable
                        style={styles.dokOeffnenBtn}
                        onPress={() => WebBrowser.openBrowserAsync(d.url!)}
                        accessibilityRole="button"
                        accessibilityLabel={`${erklaerungLabel(d.typ)} öffnen`}
                      >
                        <Text style={styles.dokOeffnenText}>Öffnen</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {unentschieden ? (
                    busy ? (
                      <ActivityIndicator size="small" color={C.primary} style={styles.dokBusy} />
                    ) : (
                      <View style={styles.dokAktionRow}>
                        <Pressable
                          style={styles.dokFreigebenBtn}
                          onPress={() => onEntscheiden(d, 'freigeben')}
                          accessibilityRole="button"
                          accessibilityLabel={`${erklaerungLabel(d.typ)} freigeben`}
                        >
                          <Text style={styles.dokFreigebenText}>Freigeben ✓</Text>
                        </Pressable>
                        <Pressable
                          style={styles.dokAblehnenBtn}
                          onPress={() => onEntscheiden(d, 'ablehnen')}
                          accessibilityRole="button"
                          accessibilityLabel={`${erklaerungLabel(d.typ)} ablehnen`}
                        >
                          <Text style={styles.dokAblehnenText}>Ablehnen ✕</Text>
                        </Pressable>
                      </View>
                    )
                  ) : null}
                </View>
              )
            })
          )
        ) : null
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  nachweisBereich: { marginTop: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  nachweisToggle: { fontSize: 13, fontWeight: '600', color: C.primary },
  meta: { fontSize: 13, color: C.muted },
  dokEintrag: {
    marginTop: 10,
    backgroundColor: C.field,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  dokRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dokTyp: { fontSize: 13, fontWeight: '600', color: C.text },
  dokDatei: { fontSize: 12, color: C.muted },
  dokBusy: { paddingVertical: 8 },
  dokAktionRow: { flexDirection: 'row', gap: 8 },
  // Kompakte Varianten von verifyBtn/sperrBtn aus AdminKarte
  dokFreigebenBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  dokFreigebenText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dokAblehnenBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#9a4a3540',
    backgroundColor: '#f5e6e2',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  dokAblehnenText: { color: '#9a4a35', fontSize: 13, fontWeight: '600' },
  dokOeffnenBtn: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dokOeffnenText: { fontSize: 12, fontWeight: '600', color: C.text },
})
