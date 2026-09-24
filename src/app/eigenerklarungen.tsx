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
import { authedFetch } from '@/lib/authedFetch'
import {
  ERKLAERUNG_TYPEN,
  EIGENERKLARUNG_UPLOAD,
  contentTypeFuer,
  sanitizeDateiname,
  validiereEigenerklarungDatei,
} from '@/lib/eigenerklarungTypen'
import { datumDe, gueltigkeitsHinweis, gueltigkeitsStatus, heuteBerlin } from '@/lib/nachweisGueltigkeit'
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
  gueltig_bis: string | null
}

/**
 * Die Schreibvorgänge liefen bis 11.09.2026 ohne jede Auswertung — ein
 * gescheiterter Insert blieb still, der Bildschirm zeigte danach einfach den
 * alten Stand.
 *
 * Seit dem Unique-Constraint `eigenerklarungen_ein_nachweis_je_typ` (Web-PR
 * #157) gibt es dafür einen konkreten Auslöser: Wurde derselbe Nachweis
 * parallel am Rechner angelegt, kennt die App die Zeile nicht und legt sie
 * erneut an — die Datenbank lehnt das jetzt ab.
 *
 * `23505` ist deshalb kein echter Fehlschlag, sondern ein veralteter Stand:
 * Der Nachweis IST hinterlegt. Der Aufrufer lädt in dem Fall neu und sagt das
 * auch so, statt eine Postgres-Meldung anzuzeigen.
 */
const IST_DOPPELTER_EINTRAG = (fehler: { code?: string }) => fehler.code === '23505'

function dbFehlerText(fehler: { message?: string }): string {
  return fehler.message ?? 'Der Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen.'
}

function ablaufStatus(e: Erklaerung | undefined) {
  return gueltigkeitsStatus(e?.gueltig_bis, heuteBerlin())
}

/**
 * Ein Satz zur Gueltigkeit — auch dann, wenn kein Datum hinterlegt ist.
 *
 * Das Schweigen waere hier die schlechtere Auskunft: Wer die Push „Nachweis
 * laeuft bald ab" bekommt, muss sehen koennen, welcher Nachweis ein Datum hat
 * und welcher keines.
 */
function gueltigText(e: Erklaerung | undefined): string {
  if (!e?.gueltig_bis) return 'Gültig bis: nicht hinterlegt (im Browser ergänzbar)'
  const datum = datumDe(e.gueltig_bis)
  const hinweis = gueltigkeitsHinweis(e.gueltig_bis, heuteBerlin())
  return hinweis ? `Gültig bis ${datum} · ${hinweis}` : `Gültig bis ${datum}`
}

function StatusBadge({ e }: { e: Erklaerung | undefined }) {
  if (!e || (!e.bestaetigt && !e.dateiname)) {
    return <Text style={[styles.badge, styles.badgeFehlt]}>fehlt</Text>
  }
  // Eigenerklärung ohne Datei: Daran kann ein Admin nichts prüfen — es gibt
  // kein Dokument. Der Web-Admin blendet solche Einträge aus der Prüfliste aus,
  // und /api/app-admin/anbieter zählt sie nicht mit (siehe auch
  // components/admin/NachweisBadge.tsx). Hier stand trotzdem „⏳ in Prüfung":
  // ein Wartezustand, der nie endet. Der Betrieb hat alles getan, was er tun
  // kann — das sagt der Badge jetzt.
  if (!e.dateiname) {
    return <Text style={[styles.badge, styles.badgeErklaerung]}>✓ bestätigt</Text>
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
      .select('id, typ, dateiname, bestaetigt, admin_verifiziert, admin_abgelehnt, gueltig_bis')
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

  // Rückfrage vor dem Ersetzen einer bereits hochgeladenen Datei — erst nach
  // Bestätigung öffnet sich der Datei-Picker.
  function hochladen(typ: string) {
    if (!profilId || busyTyp) return
    const bestehend = getErklaerung(typ)
    if (bestehend?.dateiname) {
      Alert.alert(
        'Datei ersetzen',
        `Möchten Sie die vorhandene Datei „${bestehend.dateiname}" durch eine neue ersetzen?`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Ersetzen', onPress: () => void dateiWaehlenUndHochladen(typ) },
        ],
      )
      return
    }
    void dateiWaehlenUndHochladen(typ)
  }

  async function dateiWaehlenUndHochladen(typ: string) {
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
      const verRes = await authedFetch('/api/datei-verifizieren', {
        method: 'POST',
        body: JSON.stringify({ bucket: 'eigenerklarungen', pfad }),
      })
      if (!verRes.ok) {
        const j = (await verRes.json().catch(() => ({}))) as { error?: string }
        Alert.alert('Datei abgelehnt', j.error ?? 'Die Datei hat die Prüfung nicht bestanden.')
        return
      }

      // DB-Eintrag – erst nach bestandener Verifikation (Spiegel Web)
      const bestehend = getErklaerung(typ)
      const { error: dbErr } = bestehend
        ? await supabase
            .from('eigenerklarungen')
            // gueltig_bis wird geleert: Das Datum gehoerte zum ALTEN Dokument.
            // Stehen zu lassen hiesse, die neue Police mit der Laufzeit der
            // alten zu beschriften — die App kann kein Datum erfassen, das
            // ergaenzt der Betrieb im Browser. Kein Datum ist ehrlicher als
            // ein falsches; die Anzeige sagt das auch so.
            .update({ dateiname: sicherName, bestaetigt: true, gueltig_bis: null })
            .eq('id', bestehend.id)
        : await supabase
            .from('eigenerklarungen')
            .insert({ anbieter_id: profilId, typ, dateiname: sicherName, bestaetigt: true })
      if (dbErr) {
        if (IST_DOPPELTER_EINTRAG(dbErr)) {
          await load()
          Alert.alert(
            'Bereits hinterlegt',
            'Dieser Nachweis war schon vorhanden – vermutlich an einem anderen Gerät '
            + 'angelegt. Die Liste ist jetzt auf dem neuesten Stand.',
          )
          return
        }
        Alert.alert('Nicht gespeichert', dbFehlerText(dbErr))
        return
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
      const { error: dbErr } = bestehend
        ? await supabase.from('eigenerklarungen').update({ bestaetigt: true }).eq('id', bestehend.id)
        : await supabase
            .from('eigenerklarungen')
            .insert({ anbieter_id: profilId, typ, dateiname: null, bestaetigt: true })
      if (dbErr) {
        if (IST_DOPPELTER_EINTRAG(dbErr)) {
          await load()
          Alert.alert(
            'Bereits hinterlegt',
            'Dieser Nachweis war schon vorhanden – vermutlich an einem anderen Gerät '
            + 'angelegt. Die Liste ist jetzt auf dem neuesten Stand.',
          )
          return
        }
        Alert.alert('Nicht gespeichert', dbFehlerText(dbErr))
        return
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
        Hinterlegen Sie Ihre Nachweise einmalig im Konto – sie werden von Vergabo geprüft und bei
        Angeboten automatisch berücksichtigt. Erlaubt: {EIGENERKLARUNG_UPLOAD.label}, max.{' '}
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
                {/* Gueltigkeit — nur Anzeige. Der Cron pusht „Nachweis laeuft
                    bald ab"; ohne diese Zeile stand der Betrieb danach vor
                    einer Liste, die nicht verriet, welcher Nachweis gemeint
                    ist. Gesetzt und geaendert wird das Datum im Browser. */}
                {typ.kannAblaufen || e?.gueltig_bis ? (
                  <Text
                    style={[
                      styles.gueltigkeit,
                      ablaufStatus(e) === 'abgelaufen' && styles.gueltigkeitAbgelaufen,
                      ablaufStatus(e) === 'laeuft_ab' && styles.gueltigkeitLaeuftAb,
                    ]}
                  >
                    {gueltigText(e)}
                  </Text>
                ) : null}
              </View>
              <StatusBadge e={e} />
            </View>

            {/* Reine Erklärung: Der Wortlaut MUSS sichtbar sein, bevor man ihn
                bestätigt. Eine Zustimmung ohne Text ist keine Erklärung,
                sondern ein Häkchen. */}
            {!typ.belegbar && typ.erklaerungstext ? (
              <Text style={styles.erklaerungstext}>{typ.erklaerungstext}</Text>
            ) : null}

            <View style={styles.aktionen}>
              {/* Kein Upload-Knopf, wo es nichts hochzuladen gibt: Für
                  „ich zahle Mindestlohn" stellt keine Behörde eine Urkunde aus. */}
              {typ.belegbar ? (
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
              ) : null}
              {!typ.pflicht && !e?.bestaetigt ? (
                <Pressable
                  style={[
                    styles.btn,
                    // Ohne Upload-Knopf daneben ist das Bestätigen die
                    // Hauptaktion und bekommt auch das Gewicht dafür.
                    typ.belegbar ? styles.btnGhost : styles.btnPrimary,
                    busy && styles.btnAus,
                  ]}
                  onPress={() => bestaetigen(typ.id)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={
                    typ.belegbar ? `${typ.label} ohne Datei bestätigen` : `${typ.label} bestätigen`
                  }
                >
                  <Text style={typ.belegbar ? styles.btnGhostText : styles.btnPrimaryText}>
                    {busy ? 'Wird gespeichert …' : typ.belegbar ? 'Ohne Datei bestätigen' : 'Erklärung abgeben'}
                  </Text>
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
  erklaerungstext: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 2 },
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
  gueltigkeit: { fontSize: 12, color: C.muted, marginTop: 2 },
  gueltigkeitLaeuftAb: { color: C.accent, fontWeight: '600' },
  gueltigkeitAbgelaufen: { color: '#7a3320', fontWeight: '700' },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  badgeFehlt: { backgroundColor: C.field, color: C.muted },
  // Bewusst nicht das Grün von „freigegeben": Freigegeben hat hier niemand,
  // die Erklärung steht für sich.
  badgeErklaerung: { backgroundColor: '#f0efe9', color: C.muted },
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
