import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter, useFocusEffect, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { AuftragKarte, type AuftragItem } from '@/components/AuftragKarte'
import { addPushTapListener, registriereFuerPush } from '@/lib/push'
import { gewerkLabel } from '@/lib/labels'
import { haversineKm, plzKoordinaten } from '@/lib/geo'
import { C } from '@/lib/theme'

function Chip({ label, aktiv, onPress }: { label: string; aktiv: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, aktiv ? styles.chipAktiv : styles.chipInaktiv]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: aktiv }}
      accessibilityLabel={`Filter ${label}`}
    >
      <Text style={[styles.chipText, aktiv ? styles.chipTextAktiv : styles.chipTextInaktiv]}>
        {label}
      </Text>
    </Pressable>
  )
}

export function AnbieterHome() {
  const router = useRouter()
  const [auftraege, setAuftraege] = useState<AuftragItem[]>([])
  // auftrag_id → eigener Angebotspreis (netto); Schlüssel-Existenz = beworben
  const [meineAngebote, setMeineAngebote] = useState<Map<string, number | null>>(new Map())
  // Aufträge, zu denen der Anbieter eingeladen wurde (RLS liefert nur eigene Einladungen)
  const [einladungen, setEinladungen] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [gewerkFilter, setGewerkFilter] = useState<string | null>(null)
  // Standard: nur passende Aufträge (eigene Gewerke + Aktionsradius) — wie das
  // serverseitige Matching für die Push-Benachrichtigungen. „Alle" schaltet um.
  const [modus, setModus] = useState<'passend' | 'alle'>('passend')
  // Eigenes Profil für den Passend-Filter (Own-Row-RLS)
  const [profil, setProfil] = useState<{
    gewerke: string[]
    radius: number
    lat: number | null
    lon: number | null
    plz: string | null
  } | null>(null)
  // auftrag_id → Luftlinie in km (null = nicht bestimmbar → nicht ausfiltern)
  const [distanzen, setDistanzen] = useState<Map<string, number | null>>(new Map())
  // null = noch unbekannt (kein Banner-Flackern beim Laden)
  const [verifiziert, setVerifiziert] = useState<boolean | null>(null)
  // Anzahl ungelesener Benachrichtigungen (Badge am 🔔)
  const [ungeleseneAnzahl, setUngeleseneAnzahl] = useState(0)

  // In den Daten vorhandene Gewerke (für die Filter-Chips)
  const vorhandeneGewerke = useMemo(() => {
    const set = new Set<string>()
    for (const a of auftraege) if (a.gewerk) set.add(a.gewerk)
    return Array.from(set).sort()
  }, [auftraege])

  const gefilterteAuftraege = useMemo(() => {
    const q = suche.trim().toLowerCase()
    const gefiltert = auftraege.filter((a) => {
      // Passend-Modus: eigene Gewerke + Aktionsradius. Eingeladene und bereits
      // beworbene Aufträge sind per Definition relevant und bleiben sichtbar.
      if (modus === 'passend' && profil && !einladungen.has(a.id) && !meineAngebote.has(a.id)) {
        if (profil.gewerke.length > 0 && (!a.gewerk || !profil.gewerke.includes(a.gewerk))) {
          return false
        }
        const d = distanzen.get(a.id)
        if (d != null && d > profil.radius) return false
      }
      if (gewerkFilter && a.gewerk !== gewerkFilter) return false
      if (!q) return true
      const heuhaufen = [a.titel, a.ausfuehrungsort_ort, a.ausfuehrungsort_plz, gewerkLabel(a.gewerk)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return heuhaufen.includes(q)
    })
    // Eingeladene Aufträge nach oben; innerhalb der Gruppen bleibt die
    // Lade-Reihenfolge (neueste zuerst) erhalten — sort() ist stabil.
    return gefiltert.sort((a, b) => Number(einladungen.has(b.id)) - Number(einladungen.has(a.id)))
  }, [auftraege, suche, gewerkFilter, einladungen, modus, profil, distanzen, meineAngebote])

  // Gewerk-Chips: im Passend-Modus nur die eigenen Gewerke anbieten
  const chipGewerke = useMemo(
    () =>
      modus === 'passend' && profil && profil.gewerke.length > 0
        ? vorhandeneGewerke.filter((g) => profil.gewerke.includes(g))
        : vorhandeneGewerke,
    [modus, profil, vorhandeneGewerke],
  )

  const loadData = useCallback(async () => {
    const [
      { data: auftraegeData, error: auftraegeError },
      { data: bewerbungenData },
      { data: einladungenData },
      { data: profilData },
      { count: ungeleseneCount },
    ] = await Promise.all([
      // Alle Verfahren laden — RLS regelt die Sichtbarkeit (beschränkte
      // Ausschreibungen sieht der Anbieter nur, wenn er eingeladen ist).
      supabase
        .from('auftraege')
        .select(
          'id, titel, gewerk, vergabeverfahren, ausfuehrungsort_plz, ausfuehrungsort_ort, ausfuehrungsort_lat, ausfuehrungsort_lon, frist:angebotsfrist, budget_max:budget_bis, created_at:erstellt_am',
        )
        .eq('status', 'veroeffentlicht')
        .order('erstellt_am', { ascending: false }),
      // RLS liefert dem Anbieter nur die EIGENEN Bewerbungen
      supabase.from('bewerbungen').select('auftrag_id, angebotspreis_netto'),
      // RLS liefert nur die EIGENEN Einladungen
      supabase.from('einladungen').select('auftrag_id'),
      // Own-Row-RLS: liefert nur das eigene Profil (Verifizierungs-Hinweis + Passend-Filter)
      supabase
        .from('anbieter_profile')
        .select('verifiziert, gewerke, aktionsradius_km, lat, lon, plz')
        .maybeSingle(),
      // Ungelesene Benachrichtigungen zählen (RLS liefert nur die eigenen)
      supabase
        .from('benachrichtigungen')
        .select('id', { count: 'exact', head: true })
        .eq('gelesen', false),
    ])

    if (auftraegeError) {
      setError(auftraegeError.message)
      return
    }
    setError(null)
    setAuftraege((auftraegeData as AuftragItem[]) ?? [])
    const angebote = new Map<string, number | null>()
    for (const b of bewerbungenData ?? []) {
      angebote.set(b.auftrag_id, b.angebotspreis_netto ?? null)
    }
    setMeineAngebote(angebote)
    setEinladungen(new Set((einladungenData ?? []).map((e) => e.auftrag_id)))
    setVerifiziert(profilData?.verifiziert ?? null)
    setProfil(
      profilData
        ? {
            gewerke: Array.isArray(profilData.gewerke) ? profilData.gewerke : [],
            radius: profilData.aktionsradius_km ?? 50,
            lat: profilData.lat ?? null,
            lon: profilData.lon ?? null,
            plz: profilData.plz ?? null,
          }
        : null,
    )
    setUngeleseneAnzahl(ungeleseneCount ?? 0)
  }, [])

  // Luftlinien-Distanzen bestimmen: exakte Koordinaten, sonst PLZ-Mittelpunkt
  // via OpenPLZ (gleiche Quelle wie das Web-Matching). Nicht auflösbare
  // Distanzen bleiben null und werden bewusst NICHT ausgefiltert.
  useEffect(() => {
    let aktiv = true
    ;(async () => {
      if (!profil || auftraege.length === 0) return
      let eigene =
        profil.lat != null && profil.lon != null ? { lat: profil.lat, lng: profil.lon } : null
      if (!eigene && profil.plz) eigene = await plzKoordinaten(profil.plz)
      if (!eigene) {
        if (aktiv) setDistanzen(new Map())
        return
      }
      const map = new Map<string, number | null>()
      for (const a of auftraege) {
        let ziel =
          a.ausfuehrungsort_lat != null && a.ausfuehrungsort_lon != null
            ? { lat: a.ausfuehrungsort_lat, lng: a.ausfuehrungsort_lon }
            : null
        if (!ziel && a.ausfuehrungsort_plz) ziel = await plzKoordinaten(a.ausfuehrungsort_plz)
        map.set(a.id, ziel ? haversineKm(eigene.lat, eigene.lng, ziel.lat, ziel.lng) : null)
      }
      if (aktiv) setDistanzen(map)
    })()
    return () => {
      aktiv = false
    }
  }, [auftraege, profil])

  // Bei jedem Fokus neu laden, damit der "Beworben"-Status nach dem Einreichen
  // sofort erscheint (nicht erst nach manuellem Pull-to-Refresh).
  useFocusEffect(
    useCallback(() => {
      let aktiv = true
      loadData().finally(() => {
        if (aktiv) setLoading(false)
      })
      return () => {
        aktiv = false
      }
    }, [loadData]),
  )

  // Push-Registrierung (Token speichern) + Tap-Navigation zur Ausschreibung.
  // No-op in Expo Go / ohne Berechtigung — greift erst im Dev-/EAS-Build.
  useEffect(() => {
    registriereFuerPush()
    return addPushTapListener((link) => router.push(link as Href))
  }, [router])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  if (loading) {    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>Ausschreibungen</Text>
        <View style={styles.headerAktionen}>
          <Pressable
            onPress={() => router.push('/eigenerklarungen')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Nachweise und Erklärungen verwalten"
          >
            <Text style={styles.headerLink}>Nachweise</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/benachrichtigungen' as Href)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Benachrichtigungen (${ungeleseneAnzahl} ungelesen)`}
          >
            <View>
              <Text style={styles.headerIcon}>{'🔔'}</Text>
              {ungeleseneAnzahl > 0 ? <View style={styles.badgePunkt} /> : null}
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push('/einstellungen' as Href)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Einstellungen"
          >
            <Text style={styles.headerIcon}>{'⚙️'}</Text>
          </Pressable>
          {/* "Abmelden" bewusst nicht mehr im Header (zu eng, lief rechts aus
              dem Bild) — es liegt im ⚙️-Einstellungen-Screen. */}
        </View>
      </View>

      <View style={styles.filterBar}>
        <View style={styles.searchRow}>
          <Text style={styles.searchIcon} importantForAccessibility="no" accessibilityElementsHidden>
            🔍
          </Text>
          <TextInput
            style={styles.searchInput}
            value={suche}
            onChangeText={setSuche}
            placeholder="Suche nach Titel, Ort, Gewerk …"
            placeholderTextColor={C.muted}
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {suche.length > 0 ? (
            <Pressable
              onPress={() => setSuche('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Suche löschen"
            >
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label={profil ? `Passend (${profil.radius} km)` : 'Passend'}
            aktiv={modus === 'passend'}
            onPress={() => {
              setModus('passend')
              setGewerkFilter(null)
            }}
          />
          <Chip
            label="Alle"
            aktiv={modus === 'alle' && gewerkFilter === null}
            onPress={() => {
              setModus('alle')
              setGewerkFilter(null)
            }}
          />
          {chipGewerke.length > 1
            ? chipGewerke.map((g) => (
                <Chip
                  key={g}
                  label={gewerkLabel(g)}
                  aktiv={gewerkFilter === g}
                  onPress={() => setGewerkFilter((prev) => (prev === g ? null : g))}
                />
              ))
            : null}
        </ScrollView>
      </View>

      {verifiziert === false ? (
        <Pressable
          style={styles.verifBanner}
          onPress={() => router.push('/eigenerklarungen')}
          accessibilityRole="button"
          accessibilityLabel="Konto noch nicht verifiziert – Nachweise hochladen"
        >
          <Text style={styles.verifBannerText}>
            ⏳ Ihr Konto ist noch nicht verifiziert – Zuschläge sind erst nach der Verifizierung
            möglich. <Text style={styles.verifBannerLink}>Nachweise hochladen →</Text>
          </Text>
        </Pressable>
      ) : null}

      <FlatList
        data={gefilterteAuftraege}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AuftragKarte
            auftrag={item}
            beworben={meineAngebote.has(item.id)}
            eingeladen={einladungen.has(item.id)}
            angebotPreis={meineAngebote.get(item.id) ?? null}
            onPress={() => router.push(`/auftraege/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        ListHeaderComponent={
          auftraege.length > 0 ? (
            <Text style={styles.count}>
              {gefilterteAuftraege.length}{' '}
              {gefilterteAuftraege.length === 1 ? 'Ausschreibung' : 'Ausschreibungen'}
              {modus === 'passend' && profil
                ? ` · passend zu Ihren Gewerken im Umkreis von ${profil.radius} km`
                : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {error
                ? `Fehler beim Laden: ${error}`
                : auftraege.length > 0
                  ? modus === 'passend' && !suche.trim()
                    ? 'Keine passenden Ausschreibungen in Ihren Gewerken und Ihrem Umkreis. Unter „Alle" sehen Sie sämtliche Verfahren.'
                    : 'Keine Treffer für Ihre Suche'
                  : 'Keine offenen Ausschreibungen'}
            </Text>
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
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text, flexShrink: 1, marginRight: 12 },
  headerAktionen: { flexDirection: 'row', alignItems: 'center', gap: 18, flexShrink: 0 },
  headerLink: { fontSize: 14, color: C.primary, fontWeight: '600' },
  headerIcon: { fontSize: 16 },
  badgePunkt: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.accent,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  filterBar: {
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: C.text },
  clearText: { fontSize: 15, color: C.muted, paddingHorizontal: 4 },
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipAktiv: { backgroundColor: C.primary, borderColor: C.primary },
  chipInaktiv: { backgroundColor: C.card, borderColor: C.border },
  chipText: { fontSize: 13, fontWeight: '600' },
  chipTextAktiv: { color: '#ffffff' },
  chipTextInaktiv: { color: C.muted },
  verifBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.warn,
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 10,
  },
  verifBannerText: { fontSize: 13, color: C.accent, lineHeight: 19 },
  verifBannerLink: { fontWeight: '700', textDecorationLine: 'underline' },
  count: { fontSize: 12, color: C.muted, marginBottom: 12 },
  list: { padding: 16 },
  empty: { paddingTop: 64, alignItems: 'center', paddingHorizontal: 24 },
  emptyText: { fontSize: 16, color: C.muted, textAlign: 'center', lineHeight: 23 },
})
