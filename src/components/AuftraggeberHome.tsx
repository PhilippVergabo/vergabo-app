import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { API_URL } from '@/lib/config'
import { gewerkLabel } from '@/lib/labels'
import { C } from '@/lib/theme'

// Statuslabel + Farbe (Hintergrund, Text)
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  entwurf: { label: 'Entwurf', bg: '#ece8df', fg: '#6b6b60' },
  veroeffentlicht: { label: 'Veröffentlicht', bg: '#e8f0e9', fg: '#3a5a3e' },
  in_pruefung: { label: 'In Prüfung', bg: '#fdf3ea', fg: '#c87941' },
  vergeben: { label: 'Vergeben', bg: '#e6eef5', fg: '#2f5d8a' },
  abgeschlossen: { label: 'Abgeschlossen', bg: '#ece8df', fg: '#6b6b60' },
  storniert: { label: 'Storniert', bg: '#f5e6e2', fg: '#9a4a35' },
}

type AGAuftrag = {
  id: string
  titel: string
  status: string
  gewerk: string | null
  ausfuehrungsort_ort: string | null
  angebotsfrist: string | null
  erstellt_am: string
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function AuftraggeberKarte({ auftrag, anzahl }: { auftrag: AGAuftrag; anzahl: number }) {
  const status = STATUS[auftrag.status] ?? { label: auftrag.status, bg: '#ece8df', fg: '#6b6b60' }
  const frist = formatDate(auftrag.angebotsfrist)
  const meta = [auftrag.gewerk ? gewerkLabel(auftrag.gewerk) : null, auftrag.ausfuehrungsort_ort]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={styles.cardItem}>
      <View style={styles.cardHead}>
        <Text style={styles.titel} numberOfLines={2}>
          {auftrag.titel}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>

      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {frist ? <Text style={styles.meta}>{'\u{1F4C5}'} Frist: {frist}</Text> : null}

      <View style={styles.bewerbungenRow}>
        {anzahl > 0 ? (
          <Text style={styles.bewerbungenAktiv}>
            {'\u{1F4E5}'} {anzahl} {anzahl === 1 ? 'Bewerbung' : 'Bewerbungen'}
          </Text>
        ) : (
          <Text style={styles.bewerbungenLeer}>Noch keine Bewerbungen</Text>
        )}
      </View>
    </View>
  )
}

export function AuftraggeberHome() {
  const router = useRouter()
  const [auftraege, setAuftraege] = useState<AGAuftrag[]>([])
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [istAdmin, setIstAdmin] = useState(false)

  // Admin-Status serverseitig prüfen (zeigt nur den Einstieg; echte Aktionen
  // sind im Admin-Screen zusätzlich 2FA-/Server-geschützt).
  useEffect(() => {
    let aktiv = true
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) return
      try {
        const res = await fetch(`${API_URL}/api/app-admin/status`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const j = (await res.json()) as { isAdmin?: boolean }
        if (aktiv) setIstAdmin(!!j.isAdmin)
      } catch {
        /* offline / Endpoint noch nicht deployed — Admin-Einstieg bleibt aus */
      }
    })()
    return () => {
      aktiv = false
    }
  }, [])

  const loadData = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession()
    const userId = sess.session?.user.id
    if (!userId) {
      setError('Nicht angemeldet')
      return
    }

    const { data: ap } = await supabase
      .from('auftraggeber_profile')
      .select('id')
      .eq('user_id', userId)
      .single()
    if (!ap) {
      setError('Kein Auftraggeber-Profil gefunden')
      return
    }

    const { data: auftraegeData, error: auftraegeError } = await supabase
      .from('auftraege')
      .select('id, titel, status, gewerk, ausfuehrungsort_ort, angebotsfrist, erstellt_am')
      .eq('auftraggeber_id', ap.id)
      .order('erstellt_am', { ascending: false })

    if (auftraegeError) {
      setError(auftraegeError.message)
      return
    }
    setError(null)
    const liste = (auftraegeData as AGAuftrag[]) ?? []
    setAuftraege(liste)

    const ids = liste.map((a) => a.id)
    const next = new Map<string, number>()
    if (ids.length > 0) {
      const { data: bw } = await supabase.from('bewerbungen').select('auftrag_id').in('auftrag_id', ids)
      for (const b of bw ?? []) next.set(b.auftrag_id, (next.get(b.auftrag_id) ?? 0) + 1)
    }
    setCounts(next)
  }, [])

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [loadData])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const gesamtBewerbungen = auftraege.reduce((s, a) => s + (counts.get(a.id) ?? 0), 0)

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Meine Ausschreibungen</Text>
        <Pressable onPress={handleLogout} hitSlop={8}>
          <Text style={styles.logout}>Abmelden</Text>
        </Pressable>
      </View>
      {istAdmin ? (
        <Pressable style={styles.adminRow} onPress={() => router.push('/admin')}>
          <Text style={styles.adminRowText}>🛡️ Admin – Anbieter verifizieren</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={auftraege}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AuftraggeberKarte auftrag={item} anzahl={counts.get(item.id) ?? 0} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        ListHeaderComponent={
          auftraege.length > 0 ? (
            <Text style={styles.summary}>
              {auftraege.length} {auftraege.length === 1 ? 'Ausschreibung' : 'Ausschreibungen'} ·{' '}
              {gesamtBewerbungen} {gesamtBewerbungen === 1 ? 'Bewerbung' : 'Bewerbungen'} gesamt
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {error ? `Fehler: ${error}` : 'Du hast noch keine Ausschreibungen veröffentlicht.'}
            </Text>
            {!error ? (
              <Text style={styles.emptyHint}>
                Neue Ausschreibungen legst du auf vergabo.de an. Hier siehst du den Status und
                eingehende Bewerbungen.
              </Text>
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  logout: { fontSize: 14, color: C.muted },
  adminRow: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#3a5a3e12',
    borderWidth: 1,
    borderColor: '#3a5a3e33',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  adminRowText: { fontSize: 14, color: C.primary, fontWeight: '700' },
  list: { padding: 16 },
  summary: { fontSize: 12, color: C.muted, marginBottom: 12 },
  cardItem: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  titel: { fontSize: 16, fontWeight: '600', color: C.text, flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 13, color: C.muted },
  bewerbungenRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  bewerbungenAktiv: { fontSize: 14, fontWeight: '700', color: C.accent },
  bewerbungenLeer: { fontSize: 14, color: C.muted },
  empty: { paddingTop: 64, alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  emptyText: { fontSize: 16, color: C.muted, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 19 },
})
