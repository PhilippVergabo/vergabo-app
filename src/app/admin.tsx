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
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/authedFetch'
import { GEWERK_LABELS } from '@/lib/labels'
import { erklaerungLabel } from '@/lib/eigenerklarungTypen'
import { C } from '@/lib/theme'

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

// Hochgeladene Nachweise/Eigenerklärungen eines Anbieters (Admin-Sicht).
// url = kurzlebige Signed-URL zum Öffnen der Datei (null = keine Datei).
type AdminDokument = {
  id: string
  typ: string
  dateiname: string | null
  bestaetigt: boolean | null
  admin_verifiziert: boolean | null
  admin_abgelehnt: boolean | null
  url: string | null
}

// Einheitliches Karten-Modell: beide Rollen werden beim Laden hierauf
// normalisiert, damit Liste + Aktionen nur EIN Gerüst brauchen.
type AdminEintrag = {
  id: string
  titel: string
  zeilen: string[] // gedämpfte Meta-Zeilen (Person, PLZ + Ort)
  akzent: string // Akzent-Zeile (Gewerke bzw. Organisationstyp)
  verifiziert: boolean
}

type Tab = 'anbieter' | 'auftraggeber'

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

// Status-Logik wie StatusBadge in eigenerklarungen.tsx (Anbieter-Sicht),
// damit Admin und Anbieter denselben Zustand sehen.
function NachweisBadge({ d }: { d: AdminDokument }) {
  if (!d.bestaetigt && !d.dateiname) {
    return <Text style={[styles.dokBadge, styles.dokBadgeFehlt]}>fehlt</Text>
  }
  if (d.admin_verifiziert) {
    return <Text style={[styles.dokBadge, styles.dokBadgeOk]}>✓ freigegeben</Text>
  }
  if (d.admin_abgelehnt) {
    return <Text style={[styles.dokBadge, styles.dokBadgeAbgelehnt]}>✕ abgelehnt</Text>
  }
  return <Text style={[styles.dokBadge, styles.dokBadgeWartet]}>⏳ in Prüfung</Text>
}

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
        renderItem={({ item }) => {
          const busy = busyId === item.id
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
                <View style={styles.nachweisBereich}>
                  <Pressable
                    onPress={() => toggleNachweise(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Nachweise von ${item.titel} ${nachweiseOffen[item.id] ? 'ausblenden' : 'anzeigen'}`}
                  >
                    <Text style={styles.nachweisToggle}>
                      {nachweiseOffen[item.id] ? '▾ Nachweise ausblenden' : '▸ Nachweise anzeigen'}
                    </Text>
                  </Pressable>
                  {nachweiseOffen[item.id] ? (
                    nachweiseLadenId === item.id ? (
                      <ActivityIndicator color={C.primary} style={{ marginTop: 8 }} />
                    ) : nachweise[item.id] != null ? (
                      nachweise[item.id]!.length === 0 ? (
                        <Text style={[styles.meta, { marginTop: 8 }]}>Keine Nachweise hinterlegt.</Text>
                      ) : (
                        nachweise[item.id]!.map((d) => (
                          <View key={d.id} style={styles.dokRow}>
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
                        ))
                      )
                    ) : null
                  ) : null}
                </View>
              ) : null}

              <View style={styles.aktionRow}>
                {item.verifiziert ? (
                  <Pressable
                    style={[styles.sperrBtn, busy && styles.btnDisabled]}
                    disabled={busy}
                    onPress={() => setVerifiziert(tab, item, false)}
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
                    onPress={() => setVerifiziert(tab, item, true)}
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
        }}
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
  nachweisBereich: { marginTop: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  nachweisToggle: { fontSize: 13, fontWeight: '600', color: C.primary },
  dokRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: C.field,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dokTyp: { fontSize: 13, fontWeight: '600', color: C.text },
  dokDatei: { fontSize: 12, color: C.muted },
  dokBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dokBadgeFehlt: { backgroundColor: C.card, color: C.muted },
  dokBadgeOk: { backgroundColor: C.ok, color: C.primary },
  dokBadgeWartet: { backgroundColor: C.warn, color: C.accent },
  dokBadgeAbgelehnt: { backgroundColor: '#f7e3df', color: '#7a3320' },
  dokOeffnenBtn: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dokOeffnenText: { fontSize: 12, fontWeight: '600', color: C.text },
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
