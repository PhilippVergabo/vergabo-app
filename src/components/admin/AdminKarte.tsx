import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { C } from '@/lib/theme'
import { type AdminDokument } from './NachweisBadge'
import { NachweisListe } from './NachweisListe'

export type Tab = 'anbieter' | 'auftraggeber'

// Einheitliches Karten-Modell: beide Rollen werden beim Laden hierauf
// normalisiert, damit Liste + Aktionen nur EIN Gerüst brauchen.
export type AdminEintrag = {
  id: string
  titel: string
  zeilen: string[] // gedämpfte Meta-Zeilen (Person, PLZ + Ort)
  akzent: string // Akzent-Zeile (Gewerke bzw. Organisationstyp)
  verifiziert: boolean
}

type Props = {
  item: AdminEintrag
  tab: Tab
  busy: boolean
  onSetVerifiziert: (verifizieren: boolean) => void
  /** Nachweise (nur tab === 'anbieter'); null = noch nicht geladen. */
  nachweisDokumente: AdminDokument[] | null
  nachweisOffen: boolean
  nachweisLaedt: boolean
  onToggleNachweise: () => void
  /** id des Nachweises, dessen Freigabe/Ablehnung gerade läuft (null = keine). */
  nachweisBusyDokId: string | null
  onNachweisEntscheiden: (dok: AdminDokument, aktion: 'freigeben' | 'ablehnen') => void
}

// Eine Karte der Admin-Liste (Anbieter ODER Auftraggeber). 1:1 aus dem
// renderItem in admin.tsx verschoben; Zustand + API-Aufrufe bleiben im Screen.
export function AdminKarte({
  item,
  tab,
  busy,
  onSetVerifiziert,
  nachweisDokumente,
  nachweisOffen,
  nachweisLaedt,
  onToggleNachweise,
  nachweisBusyDokId,
  onNachweisEntscheiden,
}: Props) {
  return (
    <View style={styles.cardItem}>
      <View style={styles.cardHead}>
        <Text style={styles.titel} numberOfLines={2}>
          {item.titel}
        </Text>
        {item.verifiziert ? (
          <View style={[styles.badge, styles.badgeOk]}>
            <Text style={styles.badgeOkText}>✓ Verifiziert</Text>
          </View>
        ) : (
          <View style={[styles.badge, styles.badgeWarn]}>
            <Text style={styles.badgeWarnText}>Offen</Text>
          </View>
        )}
      </View>
      {item.zeilen.map((zeile, i) => (
        <Text key={i} style={styles.meta}>
          {zeile}
        </Text>
      ))}
      {item.akzent ? <Text style={styles.metaAkzent}>{item.akzent}</Text> : null}

      {tab === 'anbieter' ? (
        <NachweisListe
          titel={item.titel}
          dokumente={nachweisDokumente}
          offen={nachweisOffen}
          laedt={nachweisLaedt}
          onToggle={onToggleNachweise}
          busyDokId={nachweisBusyDokId}
          onEntscheiden={onNachweisEntscheiden}
        />
      ) : null}

      <View style={styles.aktionRow}>
        {item.verifiziert ? (
          <Pressable
            style={[styles.sperrBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => onSetVerifiziert(false)}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            accessibilityLabel={`Verifizierung von ${item.titel} entziehen`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#9a4a35" />
            ) : (
              <Text style={styles.sperrBtnText}>Verifizierung entziehen</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.verifyBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => onSetVerifiziert(true)}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            accessibilityLabel={`${item.titel} verifizieren`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.verifyBtnText}>✓ Verifizieren</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cardItem: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 5,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  titel: { fontSize: 16, fontWeight: '600', color: C.text, flex: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeOk: { backgroundColor: C.ok },
  badgeOkText: { fontSize: 11, fontWeight: '700', color: C.primary },
  badgeWarn: { backgroundColor: '#fdf3ea' },
  badgeWarnText: { fontSize: 11, fontWeight: '700', color: C.accent },
  meta: { fontSize: 13, color: C.muted },
  metaAkzent: { fontSize: 13, color: C.accent, fontWeight: '500' },
  btnDisabled: { opacity: 0.5 },
  aktionRow: { marginTop: 10, flexDirection: 'row' },
  verifyBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  verifyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sperrBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#9a4a3540',
    backgroundColor: '#f5e6e2',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  sperrBtnText: { color: '#9a4a35', fontSize: 14, fontWeight: '600' },
})
