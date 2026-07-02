import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from '@/lib/supabase'
import { API_URL } from '@/lib/config'
import {
  ERKLAERUNG_TYPEN,
  EIGENERKLARUNG_UPLOAD,
  contentTypeFuer,
  sanitizeDateiname,
  validiereEigenerklarungDatei,
} from '@/lib/eigenerklarungTypen'
import { C } from '@/lib/theme'

// Spiegel von vergabo/app/dashboard/anbieter/eigenerklarungen (Web):
// Nachweise/Eigenerklärungen im Konto hinterlegen. Flow je Datei:
// Client-Vorprüfung → Storage-Upload ({anbieter_profile.id}/{typ}/{name}) →
// serverseitige Magic-Byte-Verifikation (/api/datei-verifizieren, Bearer) →
// DB-Eintrag erst NACH bestandener Verifikation. Pflichttypen brauchen eine
// Datei; die übrigen lassen sich auch ohne Datei als Eigenerklärung bestätigen.

type Erklaerung = {
  id: string
  typ: string
  dateiname: string | null
  bestaetigt: boolean | null
  admin_verifiziert: boolean | null
  admin_abgelehnt: boolean | null
}

function StatusBadge({ e }: { e: Erklaerung | undefined }) {
  if (!e || (!e.bestaetigt && !e.dateiname)) {
    return <Text style={[styles.badge, styles.badgeFehlt]}>fehlt</Text>
  }
  if (e.admin_verifiziert) {
    return <Text style={[styles.badge, styles.badgeOk]}>✓ freigegeben</Text>
  }
  if (e.admin_abgelehnt) {
    return <Text style={[styles.badge, styles.badgeAbgelehnt]}>✕ abgelehnt</Text>
  }
  return <Text style={[styles.badge, styles.badgeWartet]}>⏳ in Prüfung</Text>
}

export default function EigenerklarungenScreen() {
  const [profilId, setProfilId] = useState<string | null>(null)
  const [erklaerungen, setErklaerungen] = useState<Erklaerung[]>([])
  const [laden, setLaden] = useState(true)
  const [busyTyp, setBusyTyp] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: profil } = await supabase.from('anbieter_profile').select('id').maybeSingle()
    const pid = (profil?.id as string | undefined) ?? null
    setProfilId(pid)
    if (!pid) return
    const { data } = await supabase
      .from('eigenerklarungen')
      .select('id, typ, dateiname, bestaetigt, admin_verifiziert, admin_abgelehnt')
      .eq('anbieter_id', pid)
    setErklaerungen((data as Erklaerung[]) ?? [])
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

  const getErklaerung = (typ: string) => erklaerungen.find((e) => e.typ === typ)

  async function hochladen(typ: string) {
    if (!profilId || busyTyp) return
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/png', 'image/jpeg'],
      copyToCacheDirectory: true,
    })
    if (res.canceled || !res.assets?.[0]) return
    const asset = res.assets[0]
    const file = { name: asset.name, size: asset.size ?? 0 }

    const v = validiereEigenerklarungDatei(file)
    if (!v.ok) {
      Alert.alert('Datei nicht erlaubt', v.fehler)
      return
    }

    setBusyTyp(typ)
    try {
      // Datei lesen und unter sanitisiertem Namen hochladen
      const sicherName = sanitizeDateiname(asset.name)
      const pfad = `${profilId}/${typ}/${sicherName}`
      const bytes = await (await fetch(asset.uri)).arrayBuffer()
      const { error: upErr } = await supabase.storage
        .from('eigenerklarungen')
        .upload(pfad, bytes, { upsert: true, contentType: contentTypeFuer(sicherName) })
      if (upErr) {
        Alert.alert('Upload fehlgeschlagen', upErr.message)
        return
      }

      // Serverseitige Magic-Byte-Verifikation VOR dem DB-Eintrag
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const verRes = await fetch(`${API_URL}/api/datei-verifizieren`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bucket: 'eigenerklarungen', pfad }),
      })
      if (!verRes.ok) {
        const j = (await verRes.json().catch(() => ({}))) as { error?: string }
        Alert.alert('Datei abgelehnt', j.error ?? 'Die Datei hat die Prüfung nicht bestanden.')
        return
      }

      // DB-Eintrag – erst nach bestandener Verifikation (Spiegel Web)
      const bestehend = getErklaerung(typ)
      if (bestehend) {
        await supabase
          .from('eigenerklarungen')
          .update({ dateiname: sicherName, bestaetigt: true })
          .eq('id', bestehend.id)
      } else {
        await supabase
          .from('eigenerklarungen')
          .insert({ anbieter_id: profilId, typ, dateiname: sicherName, bestaetigt: true })
      }
      await load()
    } finally {
      setBusyTyp(null)
    }
  }

  // Eigenerklärung ohne Datei – nur für Nicht-Pflicht-Typen (Spiegel Web)
  async function bestaetigen(typ: string) {
    if (!profilId || busyTyp) return
    const typDef = ERKLAERUNG_TYPEN.find((t) => t.id === typ)
    if (typDef?.pflicht) {
      Alert.alert('Datei erforderlich', 'Für diesen Pflichtnachweis ist ein Datei-Upload erforderlich.')
      return
    }
    setBusyTyp(typ)
    try {
      const bestehend = getErklaerung(typ)
      if (bestehend) {
        await supabase.from('eigenerklarungen').update({ bestaetigt: true }).eq('id', bestehend.id)
      } else {
        await supabase
          .from('eigenerklarungen')
          .insert({ anbieter_id: profilId, typ, dateiname: null, bestaetigt: true })
      }
      await load()
    } finally {
      setBusyTyp(null)
    }
  }

  if (laden) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    )
  }

  if (!profilId) {
    return (
      <View style={styles.center}>
        <Text style={styles.mutedText}>Kein Anbieter-Profil gefunden.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Hinterlege deine Nachweise einmalig im Konto – sie werden von Vergabo geprüft und bei
        Bewerbungen automatisch berücksichtigt. Erlaubt: {EIGENERKLARUNG_UPLOAD.label}, max.{' '}
        {Math.round(EIGENERKLARUNG_UPLOAD.maxBytes / (1024 * 1024))} MB pro Datei.
      </Text>

      {ERKLAERUNG_TYPEN.map((typ) => {
        const e = getErklaerung(typ.id)
        const busy = busyTyp === typ.id
        return (
          <View key={typ.id} style={styles.karte}>
            <View style={styles.kartenKopf}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.typLabel}>{typ.label}</Text>
                {typ.pflicht ? <Text style={styles.pflicht}>Pflichtnachweis</Text> : null}
                {e?.dateiname ? <Text style={styles.dateiname}>📎 {e.dateiname}</Text> : null}
              </View>
              <StatusBadge e={e} />
            </View>

            <View style={styles.aktionen}>
              <Pressable
                style={[styles.btn, styles.btnPrimary, busy && styles.btnAus]}
                onPress={() => hochladen(typ.id)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${typ.label} hochladen`}
              >
                <Text style={styles.btnPrimaryText}>
                  {busy ? 'Wird geprüft …' : e?.dateiname ? 'Datei ersetzen' : 'Datei hochladen'}
                </Text>
              </Pressable>
              {!typ.pflicht && !e?.bestaetigt ? (
                <Pressable
                  style={[styles.btn, styles.btnGhost, busy && styles.btnAus]}
                  onPress={() => bestaetigen(typ.id)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`${typ.label} ohne Datei bestätigen`}
                >
                  <Text style={styles.btnGhostText}>Ohne Datei bestätigen</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  mutedText: { color: C.muted, fontSize: 16 },
  intro: { fontSize: 13, color: C.muted, lineHeight: 19 },
  karte: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 12,
  },
  kartenKopf: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  typLabel: { fontSize: 15, fontWeight: '600', color: C.text },
  pflicht: { fontSize: 11, fontWeight: '700', color: C.accent, textTransform: 'uppercase' },
  dateiname: { fontSize: 12, color: C.muted, marginTop: 2 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  badgeFehlt: { backgroundColor: C.field, color: C.muted },
  badgeOk: { backgroundColor: C.ok, color: C.primary },
  badgeWartet: { backgroundColor: C.warn, color: C.accent },
  badgeAbgelehnt: { backgroundColor: '#f7e3df', color: '#7a3320' },
  aktionen: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  btnAus: { opacity: 0.5 },
  btnPrimary: { backgroundColor: C.primary },
  btnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  btnGhostText: { color: C.text, fontSize: 13, fontWeight: '600' },
})
