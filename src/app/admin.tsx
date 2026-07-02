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
import { API_URL } from '@/lib/config'
import { GEWERK_LABELS } from '@/lib/labels'
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

type Phase = 'checking' | 'mfa' | 'ready' | 'error'

async function authedFetch(path: string, init?: RequestInit) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  })
}

export default function AdminScreen() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [fehler, setFehler] = useState<string | null>(null)

  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [pruefe, setPruefe] = useState(false)

  const [anbieter, setAnbieter] = useState<AdminAnbieter[]>([])
  const [ladenListe, setLadenListe] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const ladeListe = useCallback(async () => {
    setLadenListe(true)
    try {
      const res = await authedFetch('/api/app-admin/anbieter')
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
      const j = (await res.json()) as { anbieter: AdminAnbieter[] }
      setAnbieter(j.anbieter ?? [])
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
        ladeListe()
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
      await ladeListe()
    } finally {
      setPruefe(false)
    }
  }

  async function setVerifiziert(a: AdminAnbieter, verifizieren: boolean) {
    setBusyId(a.id)
    try {
      const res = await authedFetch('/api/app-admin/anbieter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, verifizieren }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        Alert.alert('Fehlgeschlagen', (j as { error?: string }).error ?? 'Aktion nicht möglich.')
        return
      }
      // Lokal aktualisieren
      setAnbieter((prev) => prev.map((x) => (x.id === a.id ? { ...x, verifiziert: verifizieren } : x)))
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
  const offen = anbieter.filter((a) => !a.verifiziert).length
  return (
    <View style={styles.container}>
      <FlatList
        data={anbieter}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={ladenListe}
        onRefresh={ladeListe}
        ListHeaderComponent={
          <Text style={styles.summary}>
            {anbieter.length} Anbieter · {offen} offen
          </Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => {
          const gewerke = (item.gewerke ?? []).map((g) => GEWERK_LABELS[g] ?? g).join(', ')
          const ort = [item.plz, item.ort].filter(Boolean).join(' ')
          const busy = busyId === item.id
          return (
            <View style={styles.cardItem}>
              <View style={styles.cardHead}>
                <Text style={styles.firmenname} numberOfLines={2}>
                  {item.firmenname}
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
              {item.inhaber_name ? <Text style={styles.meta}>{item.inhaber_name}</Text> : null}
              {ort ? <Text style={styles.meta}>{ort}</Text> : null}
              {gewerke ? <Text style={styles.metaGewerk}>{gewerke}</Text> : null}

              <View style={styles.aktionRow}>
                {item.verifiziert ? (
                  <Pressable
                    style={[styles.sperrBtn, busy && styles.btnDisabled]}
                    disabled={busy}
                    onPress={() => setVerifiziert(item, false)}
                  >
                    <Text style={styles.sperrBtnText}>{busy ? '…' : 'Verifizierung entziehen'}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.verifyBtn, busy && styles.btnDisabled]}
                    disabled={busy}
                    onPress={() => setVerifiziert(item, true)}
                  >
                    <Text style={styles.verifyBtnText}>{busy ? '…' : '✓ Verifizieren'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )
        }}
        ListEmptyComponent={
          <View style={{ paddingTop: 64, alignItems: 'center' }}>
            <Text style={styles.muted}>Keine Anbieter vorhanden.</Text>
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
  firmenname: { fontSize: 16, fontWeight: '600', color: C.text, flex: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeOk: { backgroundColor: C.ok },
  badgeOkText: { fontSize: 11, fontWeight: '700', color: C.primary },
  badgeWarn: { backgroundColor: '#fdf3ea' },
  badgeWarnText: { fontSize: 11, fontWeight: '700', color: C.accent },
  meta: { fontSize: 13, color: C.muted },
  metaGewerk: { fontSize: 13, color: C.accent, fontWeight: '500' },
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
