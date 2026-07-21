import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Stack, useFocusEffect, useRouter, type Href } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { C } from '@/lib/theme'

// Spiegel des Web-NotificationBell (vergabo/components/NotificationBell.tsx):
// Tabelle `benachrichtigungen` (id, titel, nachricht, erstellt_am, gelesen,
// link, typ, empfaenger_id). RLS liefert nur die eigenen Zeilen; wie im Web
// filtern wir zusätzlich explizit auf empfaenger_id.

type Benachrichtigung = {
  id: string
  titel: string
  nachricht: string
  erstellt_am: string
  gelesen: boolean
  link: string | null
  typ: string
}

// Deeplinks aus Benachrichtigungen auf die App-Route normalisieren:
// Aus jedem Link-Format (auch Web-Varianten wie
// /login?next=%2Fauftraege%2F<uuid>%23rueckfragen oder /auftraege/<uuid>#anker)
// wird die Auftrags-UUID extrahiert → /auftraege/<uuid>. Links ohne
// Auftragsbezug (z. B. /dashboard) werden ignoriert (nur als gelesen markiert).
const AUFTRAG_LINK = /\/auftraege\/([0-9a-f-]{36})/

function appZiel(link: string | null): string | null {
  if (!link) return null
  let dekodiert = link
  try {
    dekodiert = decodeURIComponent(link)
  } catch {
    // ungültige Kodierung → Rohwert prüfen
  }
  const treffer = dekodiert.match(AUFTRAG_LINK)
  return treffer ? `/auftraege/${treffer[1]}` : null
}

/** Relativer Zeitstempel („vor 5 Min.") bzw. Datum für ältere Einträge. */
function zeitLabel(iso: string): string {
  const dann = new Date(iso).getTime()
  if (Number.isNaN(dann)) return ''
  const diffMs = Date.now() - dann
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const std = Math.floor(min / 60)
  if (std < 24) return `vor ${std} Std.`
  const tage = Math.floor(std / 24)
  if (tage === 1) return 'gestern'
  if (tage < 7) return `vor ${tage} Tagen`
  return new Date(iso).toLocaleDateString('de-DE')
}

export default function BenachrichtigungenScreen() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [eintraege, setEintraege] = useState<Benachrichtigung[]>([])
  const [laden, setLaden] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession()
    const uid = sess.session?.user.id ?? null
    setUserId(uid)
    if (!uid) return
    const { data } = await supabase
      .from('benachrichtigungen')
      .select('id, titel, nachricht, erstellt_am, gelesen, link, typ')
      .eq('empfaenger_id', uid)
      .order('erstellt_am', { ascending: false })
      .limit(100)
    setEintraege((data as Benachrichtigung[]) ?? [])
  }, [])

  useFocusEffect(
    useCallback(() => {
      let aktiv = true
      load().finally(() => {
        if (aktiv) setLaden(false)
      })
      return () => {
        aktiv = false
      }
    }, [load]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const ungelesen = eintraege.filter((b) => !b.gelesen).length

  async function alleAlsGelesenMarkieren() {
    if (!userId || ungelesen === 0) return
    setEintraege((prev) => prev.map((b) => ({ ...b, gelesen: true })))
    await supabase
      .from('benachrichtigungen')
      .update({ gelesen: true })
      .eq('empfaenger_id', userId)
      .eq('gelesen', false)
  }

  async function antippen(b: Benachrichtigung) {
    if (!b.gelesen) {
      setEintraege((prev) => prev.map((e) => (e.id === b.id ? { ...e, gelesen: true } : e)))
      await supabase.from('benachrichtigungen').update({ gelesen: true }).eq('id', b.id)
    }
    const ziel = appZiel(b.link)
    if (ziel) {
      router.push(ziel as Href)
    }
  }

  if (laden) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () =>
            ungelesen > 0 ? (
              <Pressable
                onPress={() => void alleAlsGelesenMarkieren()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Alle Benachrichtigungen als gelesen markieren"
              >
                <Text style={styles.headerAktion}>Alle gelesen</Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        data={eintraege}
        keyExtractor={(item) => item.id}
        contentContainerStyle={eintraege.length === 0 ? styles.listLeer : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        ItemSeparatorComponent={() => <View style={styles.trenner} />}
        renderItem={({ item }) => {
          const navigierbar = !!item.link && ERLAUBTER_LINK.test(item.link)
          return (
            <Pressable
              style={({ pressed }) => [
                styles.eintrag,
                !item.gelesen && styles.eintragUngelesen,
                pressed && styles.eintragGedrueckt,
              ]}
              onPress={() => void antippen(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.gelesen ? '' : 'Ungelesen: '}${item.titel}. ${item.nachricht}`}
              accessibilityHint={
                navigierbar ? 'Öffnet die Ausschreibung' : 'Markiert die Benachrichtigung als gelesen'
              }
            >
              <View style={styles.eintragInhalt}>
                <Text style={[styles.titel, !item.gelesen && styles.titelUngelesen]}>
                  {item.titel}
                </Text>
                <Text style={styles.nachricht}>{item.nachricht}</Text>
                <Text style={styles.zeit}>{zeitLabel(item.erstellt_am)}</Text>
              </View>
              {!item.gelesen ? <View style={styles.punkt} /> : null}
            </Pressable>
          )
        }}
        ListEmptyComponent={
          <View style={styles.leer}>
            <Text style={styles.leerIcon}>🔔</Text>
            <Text style={styles.leerText}>Keine Benachrichtigungen.</Text>
            <Text style={styles.leerHinweis}>Neue Ereignisse erscheinen hier.</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  headerAktion: { fontSize: 14, color: C.primary, fontWeight: '600' },
  list: { padding: 16 },
  listLeer: { flexGrow: 1, padding: 16 },
  trenner: { height: 10 },
  eintrag: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  eintragUngelesen: { backgroundColor: C.ok, borderColor: C.primary },
  eintragGedrueckt: { opacity: 0.7 },
  eintragInhalt: { flex: 1 },
  titel: { fontSize: 15, color: C.text, fontWeight: '500' },
  titelUngelesen: { fontWeight: '700' },
  nachricht: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  zeit: { fontSize: 12, color: C.muted, marginTop: 6 },
  punkt: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.accent,
    marginTop: 5,
  },
  leer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6 },
  leerIcon: { fontSize: 32, marginBottom: 4 },
  leerText: { fontSize: 16, fontWeight: '600', color: C.text },
  leerHinweis: { fontSize: 13, color: C.muted },
})
