import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/authedFetch'
import { GEWERK_LABELS } from '@/lib/labels'
import { C } from '@/lib/theme'
import { AdminKarte, type AdminEintrag, type Tab } from '@/components/admin/AdminKarte'
import { type AdminDokument } from '@/components/admin/NachweisBadge'

type AdminAnbieter = {
  id: string
  firmenname: string
  inhaber_name: string | null
  ort: string | null
  plz: string | null
  gewerke: string[] | null
  verifiziert: boolean
}

type AdminAuftraggeber = {
  id: string
  organisation_name: string
  ansprechpartner: string | null
  ort: string | null
  plz: string | null
  organisation_typ: string | null
  verifiziert: boolean
}

const ORG_TYP_LABELS: Record<string, string> = {
  kommune: 'Kommune',
  landkreis: 'Landkreis',
  behoerde: 'Behörde',
  schule: 'Schule',
  sonstiges: 'Sonstiges',
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'anbieter', label: 'Anbieter' },
  { key: 'auftraggeber', label: 'Auftraggeber' },
]

// Pro Tab: API-Pfad + Texte + Normalisierung der Server-Antwort.
const TAB_CONFIG: Record<
  Tab,
  {
    pfad: string
    einheit: string
    leerText: string
    parse: (json: unknown) => AdminEintrag[]
  }
> = {
  anbieter: {
    pfad: '/api/app-admin/anbieter',
    einheit: 'Anbieter',
    leerText: 'Keine Anbieter vorhanden.',
    parse: (json) =>
      ((json as { anbieter?: AdminAnbieter[] }).anbieter ?? []).map((a) => ({
        id: a.id,
        titel: a.firmenname,
        zeilen: [a.inhaber_name ?? '', [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean),
        akzent: (a.gewerke ?? []).map((g) => GEWERK_LABELS[g] ?? g).join(', '),
        verifiziert: a.verifiziert,
      })),
  },
  auftraggeber: {
    pfad: '/api/app-admin/auftraggeber',
    einheit: 'Auftraggeber',
    leerText: 'Keine Auftraggeber vorhanden.',
    parse: (json) =>
      ((json as { auftraggeber?: AdminAuftraggeber[] }).auftraggeber ?? []).map((a) => ({
        id: a.id,
        titel: a.organisation_name,
        zeilen: [a.ansprechpartner ?? '', [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean),
        akzent: a.organisation_typ ? (ORG_TYP_LABELS[a.organisation_typ] ?? a.organisation_typ) : '',
        verifiziert: a.verifiziert,
      })),
  },
}

type Phase = 'checking' | 'mfa' | 'ready' | 'error'

export default function AdminScreen() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [fehler, setFehler] = useState<string | null>(null)

  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [pruefe, setPruefe] = useState(false)

  const [tab, setTab] = useState<Tab>('anbieter')
  // null = für diesen Tab noch nie geladen (Lazy-Load beim ersten Öffnen)
  const [eintraege, setEintraege] = useState<Record<Tab, AdminEintrag[] | null>>({
    anbieter: null,
    auftraggeber: null,
  })
  const [ladenListe, setLadenListe] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Nachweise pro Anbieter: einmal geladen → gecacht (null = noch nicht geladen)
  const [nachweise, setNachweise] = useState<Record<string, AdminDokument[] | null>>({})
  const [nachweiseOffen, setNachweiseOffen] = useState<Record<string, boolean>>({})
  const [nachweiseLadenId, setNachweiseLadenId] = useState<string | null>(null)

  const ladeListe = useCallback(async (t: Tab) => {
    setLadenListe(true)
    try {
      const res = await authedFetch(TAB_CONFIG[t].pfad)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        if ((j as { error?: string }).error === 'mfa_required') {
          setPhase('mfa')
          return
        }
        setFehler((j as { error?: string }).error ?? 'Laden fehlgeschlagen')
        setPhase('error')
        return
      }
      const j = (await res.json()) as unknown
      setEintraege((prev) => ({ ...prev, [t]: TAB_CONFIG[t].parse(j) }))
      setPhase('ready')
    } catch {
      setFehler('Netzwerkfehler — Endpoint evtl. noch nicht deployed.')
      setPhase('error')
    } finally {
      setLadenListe(false)
    }
  }, [])

  // Beim Öffnen: AAL prüfen. aal2 → direkt laden; sonst 2FA-Code-Schritt.
  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error || !data) {
        setFehler('2FA-Status konnte nicht geprüft werden.')
        setPhase('error')
        return
      }
      if (data.currentLevel === 'aal2') {
        ladeListe('anbieter')
        return
      }
      // Faktor ermitteln und Code-Schritt zeigen
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (!totp) {
        setFehler('Für dieses Konto ist kein 2FA-Faktor hinterlegt. Bitte im Web einrichten.')
        setPhase('error')
        return
      }
      setFactorId(totp.id)
      setPhase('mfa')
    })()
  }, [ladeListe])

  async function codePruefen() {
    if (!factorId || code.length < 6) return
    setPruefe(true)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr || !ch) {
        Alert.alert('Fehler', chErr?.message ?? 'Challenge fehlgeschlagen.')
        return
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code,
      })
      if (vErr) {
        Alert.alert('Code ungültig', 'Bitte prüfen Sie den 6-stelligen Code in Ihrer Authenticator-App.')
        setCode('')
        return
      }
      // Session ist jetzt aal2 → Liste laden
      setCode('')
      await ladeListe(tab)
    } finally {
      setPruefe(false)
    }
  }

  // Auf-/Zuklappen der Nachweise eines Anbieters; lädt beim ersten Öffnen lazy.
  async function toggleNachweise(anbieterId: string) {
    const oeffnen = !nachweiseOffen[anbieterId]
    setNachweiseOffen((prev) => ({ ...prev, [anbieterId]: oeffnen }))
    if (!oeffnen || nachweise[anbieterId] != null) return

    setNachweiseLadenId(anbieterId)
    try {
      const res = await authedFetch(
        `/api/app-admin/eigenerklarungen?anbieter_id=${encodeURIComponent(anbieterId)}`,
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        if ((j as { error?: string }).error === 'mfa_required') {
          setPhase('mfa')
          return
        }
        // Nicht cachen + wieder zuklappen, damit ein erneuter Versuch möglich ist
        setNachweiseOffen((prev) => ({ ...prev, [anbieterId]: false }))
        Alert.alert(
          'Nachweise konnten nicht geladen werden',
          (j as { error?: string }).error ?? 'Bitte versuchen Sie es erneut.',
        )
        return
      }
      const j = (await res.json()) as { dokumente?: AdminDokument[] }
      setNachweise((prev) => ({ ...prev, [anbieterId]: j.dokumente ?? [] }))
    } catch {
      setNachweiseOffen((prev) => ({ ...prev, [anbieterId]: false }))
      Alert.alert('Netzwerkfehler', 'Die Nachweise konnten nicht geladen werden. Bitte versuchen Sie es erneut.')
    } finally {
      setNachweiseLadenId(null)
    }
  }

  function wechsleTab(t: Tab) {
    if (t === tab) return
    setTab(t)
    if (eintraege[t] === null) ladeListe(t)
  }

  async function setVerifiziert(t: Tab, e: AdminEintrag, verifizieren: boolean) {
    setBusyId(e.id)
    try {
      const res = await authedFetch(TAB_CONFIG[t].pfad, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: e.id, verifizieren }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        Alert.alert('Fehlgeschlagen', (j as { error?: string }).error ?? 'Aktion nicht möglich.')
        return
      }
      // Lokal aktualisieren
      setEintraege((prev) => ({
        ...prev,
        [t]: (prev[t] ?? []).map((x) => (x.id === e.id ? { ...x, verifiziert: verifizieren } : x)),
      }))
    } catch {
      Alert.alert('Netzwerkfehler', 'Aktion konnte nicht gesendet werden.')
    } finally {
      setBusyId(null)
    }
  }

  if (phase === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
        <Text style={styles.muted}>2FA wird geprüft …</Text>
      </View>
    )
  }

  if (phase === 'error') {
    return (
      <View style={[styles.center, { padding: 24 }]}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.errorText}>{fehler}</Text>
      </View>
    )
  }

  if (phase === 'mfa') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.mfaScroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={{ fontSize: 40 }}>🛡️</Text>
          <Text style={styles.mfaTitel}>Zwei-Faktor-Bestätigung</Text>
          <Text style={styles.mfaHint}>
            Admin-Aktionen erfordern 2FA. Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.
          </Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={C.muted}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          <Pressable
            style={[styles.primaryBtn, (code.length < 6 || pruefe) && styles.btnDisabled]}
            disabled={code.length < 6 || pruefe}
            onPress={codePruefen}
          >
            {pruefe ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Bestätigen</Text>}
          </Pressable>
          <Text style={styles.mfaDismiss}>Tastatur ausblenden: nach unten wischen</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // phase === 'ready'
  const konfig = TAB_CONFIG[tab]
  const liste = eintraege[tab] ?? []
  const offen = liste.filter((e) => !e.verifiziert).length
  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        {TABS.map((t) => {
          const aktiv = tab === t.key
          return (
            <Pressable
              key={t.key}
              style={[styles.segmentBtn, aktiv && styles.segmentBtnAktiv]}
              onPress={() => wechsleTab(t.key)}
            >
              <Text style={[styles.segmentText, aktiv && styles.segmentTextAktiv]}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>
      <FlatList
        data={liste}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={ladenListe}
        onRefresh={() => ladeListe(tab)}
        ListHeaderComponent={
          <Text style={styles.summary}>
            {liste.length} {konfig.einheit} · {offen} offen
          </Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <AdminKarte
            item={item}
            tab={tab}
            busy={busyId === item.id}
            onSetVerifiziert={(verifizieren) => setVerifiziert(tab, item, verifizieren)}
            nachweisDokumente={nachweise[item.id] ?? null}
            nachweisOffen={!!nachweiseOffen[item.id]}
            nachweisLaedt={nachweiseLadenId === item.id}
            onToggleNachweise={() => toggleNachweise(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={{ paddingTop: 64, alignItems: 'center' }}>
            <Text style={styles.muted}>{ladenListe ? 'Wird geladen …' : konfig.leerText}</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, gap: 12 },
  muted: { fontSize: 14, color: C.muted },
  errorText: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22 },
  mfaScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  mfaTitel: { fontSize: 20, fontWeight: '700', color: C.text },
  mfaHint: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  mfaDismiss: { fontSize: 12, color: C.muted, marginTop: 4 },
  codeInput: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    color: C.text,
    width: 220,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    minWidth: 220,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  segment: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: 'center' },
  segmentBtnAktiv: { backgroundColor: C.primary },
  segmentText: { fontSize: 14, fontWeight: '600', color: C.muted },
  segmentTextAktiv: { color: '#fff' },
  list: { padding: 16 },
  summary: { fontSize: 12, color: C.muted, marginBottom: 12 },
})
