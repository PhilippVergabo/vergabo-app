import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { meinAnbieterId } from '@/lib/mitgliedschaft'
import { AnhaengeSektion } from '@/components/angebot/AnhaengeSektion'
import { BasisFelder } from '@/components/angebot/BasisFelder'
import { KalkulationSektion } from '@/components/angebot/KalkulationSektion'
import { NachweisSektion } from '@/components/angebot/NachweisSektion'
import { VerpflichtungenSektion } from '@/components/angebot/VerpflichtungenSektion'
import { sektionStyles } from '@/components/angebot/sektionStyles'
import {
  findePassendeEigenerklaerung,
  fmtPreis,
  toFormFile,
  type Kriterium,
  type LvPosition,
  type LvPreis,
  type PickedFile,
  type Position,
} from '@/lib/bewerbung'
import {
  ENTWURF_VERSION,
  dateiVorhanden,
  entwurfSchluessel,
  entwurfSumme,
  entwurfZeitText,
  istEntwurfLeer,
  leseEntwurf,
  loescheEntwurf,
  raeumeAlteEntwuerfe,
  schreibeEntwurf,
  sichereDatei,
  type AngebotsEntwurf,
} from '@/lib/angebotsEntwurf'
import { authedFetch } from '@/lib/authedFetch'
import { ladeBieteransicht } from '@/lib/auftragOeffentlich'
import { AutoZurueck } from '@/components/AutoZurueck'
import { C } from '@/lib/theme'

export default function BewerbenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [ladenFehler, setLadenFehler] = useState(false)
  const [ladenVersuch, setLadenVersuch] = useState(0)
  const [nichtMoeglich, setNichtMoeglich] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const [angebotsnummer, setAngebotsnummer] = useState('')
  const [ausfuehrungszeitraum, setAusfuehrungszeitraum] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [referenzen, setReferenzen] = useState('')

  const [hatLv, setHatLv] = useState(false)
  const [lvPositionen, setLvPositionen] = useState<LvPosition[]>([])
  const [lvPreise, setLvPreise] = useState<LvPreis[]>([])
  const [positionen, setPositionen] = useState<Position[]>([])
  // Startwerte der Kalkulations-Editoren: Vorlage des Auftraggebers ODER die
  // Positionen/Preise aus dem Entwurf. Beide Editoren übernehmen ihre
  // Startwerte NUR beim Mounten — deshalb werden sie gesetzt, während noch
  // `loading` gilt, und „Entwurf verwerfen" erhöht `formGeneration`.
  const [startPositionen, setStartPositionen] = useState<Position[]>([])
  const [startLvPreise, setStartLvPreise] = useState<LvPreis[]>([])
  /** IDs der vom Auftraggeber vorgegebenen Positionen — nur die sind gesperrt. */
  const [agIds, setAgIds] = useState<string[]>([])
  const [formGeneration, setFormGeneration] = useState(0)
  const [gesamtpreis, setGesamtpreis] = useState(0)

  const [eignungskriterien, setEignungskriterien] = useState<Kriterium[]>([])
  const [eignungsbestaetigung, setEignungsbestaetigung] = useState<Record<string, boolean>>({})
  const [nachweisProfilMatch, setNachweisProfilMatch] = useState<Record<string, string | null>>({})
  const [nachweisDateien, setNachweisDateien] = useState<Record<string, PickedFile>>({})

  const [verpflichtungen, setVerpflichtungen] = useState<{ titel: string; text: string }[]>([])
  const [verpflichtungenBestaetigt, setVerpflichtungenBestaetigt] = useState<boolean[]>([])
  const [verpflichtungenOffen, setVerpflichtungenOffen] = useState<Record<number, boolean>>({})

  const [anhaenge, setAnhaenge] = useState<PickedFile[]>([])
  const [bindefrist, setBindefrist] = useState<string | null>(null)

  // ── Entwurf (src/lib/angebotsEntwurf.ts) ──────────────────────────────────
  // Der vom Auftraggeber vorbelegte Ausführungszeitraum zählt NICHT als eigene
  // Eingabe — sonst meldete das Formular schon beim ersten Öffnen einen Entwurf.
  const [vorbelegterZeitraum, setVorbelegterZeitraum] = useState<string | null>(null)
  const [entwurfKey, setEntwurfKey] = useState<string | null>(null)
  const [wiederhergestellt, setWiederhergestellt] = useState<{
    am: string
    fehlendeDateien: string[]
  } | null>(null)

  useEffect(() => {
    if (!id) return
    let aktiv = true

    async function laden() {
      setLadenFehler(false)
      setNichtMoeglich(false)
      // Über die Web-Plattform statt direkt aus `auftraege`: Die Bieteransicht
      // liefert die Positionsvorlage OHNE Preise und nie die Kalkulation der
      // Vergabestelle (src/lib/auftragOeffentlich.ts).
      const ergebnis = await ladeBieteransicht(id)
      if (!aktiv) return
      if (ergebnis.art === 'nicht_veroeffentlicht') {
        setNichtMoeglich(true)
        setLoading(false)
        return
      }
      if (ergebnis.art === 'fehler') {
        // Netz-/Serverfehler ≠ „Frist abgelaufen": eigenes UI mit Retry, sonst
        // sähe der Nutzer ein leeres Formular und könnte trotzdem einreichen.
        setLadenFehler(true)
        setLoading(false)
        return
      }
      const data = ergebnis.auftrag

      // Abgabe nur bei veröffentlichter Ausschreibung und vor Fristablauf —
      // schützt auch beim direkten Aufruf (Deep-Link), nicht nur über den Button.
      const fristAbgelaufen = data.angebotsfrist
        ? new Date() >= new Date(data.angebotsfrist as string)
        : false
      if (data.status !== 'veroeffentlicht' || fristAbgelaufen) {
        setNichtMoeglich(true)
        setLoading(false)
        return
      }

      if (data.bindefrist) setBindefrist(data.bindefrist as string)

      // Vom Auftraggeber gewünschten Ausführungszeitraum ins Feld vorbelegen —
      // als echter Wert, nicht nur als Platzhalter (wie im Web; anpassbar bleibt er).
      const von = data.ausfuehrung_von
        ? new Date(data.ausfuehrung_von as string).toLocaleDateString('de-DE')
        : null
      const bis = data.ausfuehrung_bis
        ? new Date(data.ausfuehrung_bis as string).toLocaleDateString('de-DE')
        : null
      const zeitraum = von && bis ? `${von} – ${bis}` : (von ?? bis ?? null)
      setVorbelegterZeitraum(zeitraum)
      if (zeitraum) setAusfuehrungszeitraum((prev) => prev || zeitraum)

      const kriterien = (data.eignungskriterien ?? []) as Kriterium[]
      const verpfl = (data.verpflichtungserklaerungen ?? []) as { titel: string; text: string }[]
      setVerpflichtungen(verpfl)
      setVerpflichtungenBestaetigt(verpfl.map(() => false))

      const lvPos = (data.leistungsverzeichnis ?? []) as LvPosition[]
      // Bereits ohne Preise und mit der ID-Regel String(p.id ?? i + 1) — der
      // Bearbeiten-Screen sperrt genau diese IDs.
      const vorlage = data.positionenVorlage

      const mitLv = Boolean(data.hat_leistungsverzeichnis) && lvPos.length > 0
      if (mitLv) {
        setHatLv(true)
        setLvPositionen(lvPos)
      } else if (vorlage.length > 0) {
        // Positionen des Auftraggebers als Startliste — OHNE dessen Preise.
        setStartPositionen(vorlage.map((p) => ({ ...p, einzelpreis: 0, gesamt: 0 })))
        // Nur diese IDs sperren: aus einem Entwurf können eigene Positionen
        // dazukommen, die editierbar bleiben müssen.
        setAgIds(vorlage.map((p) => p.id))
      }

      // Anbieter-Profil + verifizierte Eigenerklärungen für Profil-Abgleich
      const { data: sess } = await supabase.auth.getSession()
      if (sess.session) {
        // Zuordnung über die Mitgliedschaft (anbieter_profile.user_id existiert nicht mehr).
        const anbieterId = await meinAnbieterId(sess.session.user.id)
        if (anbieterId) {
          const { count } = await supabase
            .from('bewerbungen')
            .select('id', { count: 'exact', head: true })
            .eq('anbieter_id', anbieterId)
          const nr = ((count ?? 0) + 1).toString().padStart(3, '0')
          setAngebotsnummer(`${new Date().getFullYear()}-${nr}`)

          const { data: eks } = await supabase
            .from('eigenerklarungen')
            .select('id, typ, admin_verifiziert')
            .eq('anbieter_id', anbieterId)
            .eq('admin_verifiziert', true)

          const autoBest: Record<string, boolean> = {}
          const nachweisMap: Record<string, string | null> = {}
          for (const k of kriterien) {
            const passend = findePassendeEigenerklaerung(eks, k)
            if (k.nachweis_erforderlich) nachweisMap[k.id] = passend?.id ?? null
            else if (passend) autoBest[k.id] = true
          }
          if (!aktiv) return
          setNachweisProfilMatch(nachweisMap)
          setEignungsbestaetigung(autoBest)

          // Entwurf wiederherstellen. Muss hier passieren — VOR dem ersten
          // Rendern des Formulars: Die Kalkulations-Editoren übernehmen ihre
          // Startwerte nur beim Mounten.
          const key = entwurfSchluessel(id, anbieterId)
          setEntwurfKey(key)
          const entwurf = await leseEntwurf(key)
          if (!aktiv) return
          if (entwurf) {
            if (entwurf.angebotsnummer) setAngebotsnummer(entwurf.angebotsnummer)
            if (entwurf.formData.ausfuehrungszeitraum) {
              setAusfuehrungszeitraum(entwurf.formData.ausfuehrungszeitraum)
            }
            setBeschreibung(entwurf.formData.beschreibung)
            setReferenzen(entwurf.formData.referenzen)
            if (!mitLv && entwurf.positionen.length > 0) {
              setStartPositionen(entwurf.positionen)
              setPositionen(entwurf.positionen)
            }
            if (mitLv && entwurf.lvPreise.length > 0) {
              setStartLvPreise(entwurf.lvPreise)
              setLvPreise(entwurf.lvPreise)
            }
            // Summe aus dem Entwurf: Die Editoren melden sie erst bei der
            // nächsten Eingabe — ohne das stünde „0,00 €" über einer
            // ausgefüllten Kalkulation und „Einreichen" bliebe gesperrt.
            setGesamtpreis(entwurfSumme(entwurf))
            // Häkchen aus dem Entwurf ergänzen die automatischen aus dem Profil.
            setEignungsbestaetigung({ ...autoBest, ...entwurf.eignungsbestaetigung })
            if (entwurf.verpflichtungenBestaetigt.length === verpfl.length) {
              setVerpflichtungenBestaetigt(entwurf.verpflichtungenBestaetigt)
            }
            // Dateien: nur übernehmen, was noch auf dem Gerät liegt. Der Rest
            // wird im Hinweis namentlich genannt, damit klar ist, was fehlt.
            const fehlende: string[] = []
            const nachweise: Record<string, PickedFile> = {}
            for (const [kriteriumId, datei] of Object.entries(entwurf.nachweisDateien)) {
              if (dateiVorhanden(datei)) nachweise[kriteriumId] = datei
              else fehlende.push(datei.name)
            }
            const anhaengeVorhanden = entwurf.anhaenge.filter((d) => {
              if (dateiVorhanden(d)) return true
              fehlende.push(d.name)
              return false
            })
            setNachweisDateien(nachweise)
            setAnhaenge(anhaengeVorhanden)
            setWiederhergestellt({ am: entwurf.gespeichertAm, fehlendeDateien: fehlende })
          }
        }
      }

      setEignungskriterien(kriterien)
      setLoading(false)
    }

    laden()
    return () => {
      aktiv = false
    }
  }, [id, ladenVersuch])

  // Einmal beim Öffnen alte Entwürfe samt Dateien entsorgen (älter als 30 Tage
  // oder unbrauchbar). Ein Entwurf, der nie wieder geöffnet wird, würde sonst
  // für immer liegen bleiben.
  useEffect(() => {
    void raeumeAlteEntwuerfe()
  }, [])

  // ── Entwurf automatisch speichern ─────────────────────────────────────────
  // Jede Eingabe wandert automatisch in den Entwurf — kein Knopf, kein
  // „Speichern". Kurz entprellt, damit nicht jeder Tastendruck schreibt. Ist
  // nichts Eigenes eingegeben (nur Vorbelegungen), wird ein alter Entwurf
  // gelöscht statt einer leeren Hülle, die beim nächsten Mal
  // „wiederhergestellt" meldet.
  const entwurfRef = useRef<AngebotsEntwurf | null>(null)
  const speichereEntwurf = useCallback(
    async (e: AngebotsEntwurf, key: string) => {
      if (istEntwurfLeer(e, vorbelegterZeitraum)) {
        await loescheEntwurf(key)
        return
      }
      // Dateien erst hier in den Entwurfsordner kopieren: Der Dokument-Picker
      // legt sie nur in den Cache, den iOS bei Platzmangel abräumen darf.
      // `sichereDatei` ist mehrfach aufrufbar und kopiert nur beim ersten Mal.
      const gesicherteNachweise: Record<string, PickedFile> = {}
      for (const [kriteriumId, datei] of Object.entries(e.nachweisDateien)) {
        gesicherteNachweise[kriteriumId] = sichereDatei(key, datei)
      }
      await schreibeEntwurf(key, {
        ...e,
        nachweisDateien: gesicherteNachweise,
        anhaenge: e.anhaenge.map((d) => sichereDatei(key, d)),
      })
    },
    [vorbelegterZeitraum],
  )

  useEffect(() => {
    if (!entwurfKey || loading || success) return
    const e: AngebotsEntwurf = {
      version: ENTWURF_VERSION,
      gespeichertAm: new Date().toISOString(),
      angebotsnummer,
      formData: { ausfuehrungszeitraum, beschreibung, referenzen },
      positionen: hatLv ? [] : positionen,
      lvPreise: hatLv ? lvPreise : [],
      eignungsbestaetigung,
      verpflichtungenBestaetigt,
      nachweisDateien,
      anhaenge,
    }
    entwurfRef.current = e
    const t = setTimeout(() => {
      void speichereEntwurf(e, entwurfKey)
    }, 400)
    return () => clearTimeout(t)
  }, [
    entwurfKey,
    loading,
    success,
    angebotsnummer,
    ausfuehrungszeitraum,
    beschreibung,
    referenzen,
    hatLv,
    positionen,
    lvPreise,
    eignungsbestaetigung,
    verpflichtungenBestaetigt,
    nachweisDateien,
    anhaenge,
    speichereEntwurf,
  ])

  // Beim Verlassen der App sofort schreiben: iOS entlädt eine App im
  // Hintergrund ohne Vorwarnung — die 400 ms Entprellung wären dann verloren.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') return
      const e = entwurfRef.current
      if (!entwurfKey || loading || success || !e) return
      void speichereEntwurf(e, entwurfKey)
    })
    return () => sub.remove()
  }, [entwurfKey, loading, success, speichereEntwurf])

  // „Entwurf verwerfen": Entwurf samt Dateien weg, dann das Formular neu
  // aufbauen (Vorbelegungen, Angebotsnummer, Profil-Häkchen) — wie beim ersten
  // Öffnen. `formGeneration` mountet die Kalkulations-Editoren neu; sie halten
  // ihre Werte intern und blieben sonst stehen.
  async function entwurfVerwerfen() {
    const key = entwurfKey
    setWiederhergestellt(null)
    // `loading` sperrt auch den Speicher-Effekt: Sein Aufräumen stoppt einen
    // schon laufenden Entprell-Timer, der den Entwurf sonst wieder anlegen
    // könnte, nachdem er gelöscht wurde.
    setLoading(true)
    setAngebotsnummer('')
    setAusfuehrungszeitraum('')
    setBeschreibung('')
    setReferenzen('')
    setPositionen([])
    setStartPositionen([])
    setAgIds([])
    setLvPreise([])
    setStartLvPreise([])
    setGesamtpreis(0)
    setNachweisDateien({})
    setAnhaenge([])
    setEignungsbestaetigung({})
    setVerpflichtungenBestaetigt(verpflichtungen.map(() => false))
    entwurfRef.current = null
    // Erst löschen, dann neu laden — sonst fände das Neuladen womöglich den
    // Entwurf wieder, den dieser Aufruf gerade entsorgt.
    if (key) await loescheEntwurf(key)
    setFormGeneration((g) => g + 1)
    setLadenVersuch((n) => n + 1)
  }

  const pflichtKriterienErfuellt = eignungskriterien
    .filter((k) => k.pflicht)
    .every((k) => {
      if (k.nachweis_erforderlich) return !!nachweisProfilMatch[k.id] || !!nachweisDateien[k.id]
      return !!eignungsbestaetigung[k.id]
    })

  const verpflichtungenAlleBestaetigt = verpflichtungen.every((_, i) => verpflichtungenBestaetigt[i])

  // Reihenfolge wie im Formular, damit der Hinweis von oben nach unten liest.
  const offenePflichtangaben = [
    gesamtpreis <= 0 ? 'Angebotspreis (Kalkulation ausfüllen)' : null,
    !pflichtKriterienErfuellt ? 'Eignungsnachweise' : null,
    !verpflichtungenAlleBestaetigt ? 'Verpflichtungserklärungen' : null,
    ausfuehrungszeitraum.trim().length === 0 ? 'Ausführungszeitraum' : null,
  ].filter((o): o is string => o !== null)

  const canSubmit =
    gesamtpreis > 0 &&
    ausfuehrungszeitraum.trim().length > 0 &&
    pflichtKriterienErfuellt &&
    verpflichtungenAlleBestaetigt &&
    !submitting

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess.session?.access_token) {
        Alert.alert('Nicht angemeldet', 'Bitte melden Sie sich erneut an.')
        setSubmitting(false)
        return
      }

      const bewerbungJson = JSON.stringify({
        auftrag_id: id,
        angebotsnummer: angebotsnummer || null,
        angebotspreis_netto: gesamtpreis,
        positionen: hatLv ? [] : positionen,
        lv_positionen: hatLv ? lvPreise : [],
        ausfuehrungszeitraum,
        beschreibung,
        referenzen,
        eignungsnachweis: eignungskriterien.map((k) => ({
          id: k.id,
          text: k.text,
          pflicht: k.pflicht,
          nachweis_erforderlich: k.nachweis_erforderlich ?? false,
          nachweis_typ: k.nachweis_typ ?? null,
          bestaetigt: k.nachweis_erforderlich
            ? !!nachweisProfilMatch[k.id] || !!nachweisDateien[k.id]
            : !!eignungsbestaetigung[k.id],
          nachweis_quelle: k.nachweis_erforderlich
            ? nachweisProfilMatch[k.id]
              ? 'profil'
              : nachweisDateien[k.id]
                ? 'upload'
                : null
            : null,
          eigenerklaerung_id:
            k.nachweis_erforderlich && nachweisProfilMatch[k.id] ? nachweisProfilMatch[k.id] : null,
        })),
        verpflichtungen_bestaetigt: verpflichtungen.map((v) => ({
          titel: v.titel,
          bestaetigt_am: new Date().toISOString(),
        })),
      })

      const fd = new FormData()
      fd.append('data', bewerbungJson)
      for (const [kriteriumId, file] of Object.entries(nachweisDateien)) {
        fd.append(`nachweis_${kriteriumId}`, toFormFile(file))
      }
      anhaenge.forEach((file, i) => fd.append(`anhang_${i}`, toFormFile(file)))

      // FormData: authedFetch setzt hier bewusst keinen Content-Type
      const res = await authedFetch('/api/bewerbung/einreichen', {
        method: 'POST',
        body: fd,
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        Alert.alert('Einreichen fehlgeschlagen', (j as { error?: string }).error ?? 'Bitte später erneut versuchen.')
        setSubmitting(false)
        return
      }

      // Eingereicht — Entwurf samt gesicherten Dateien entfernen.
      if (entwurfKey) await loescheEntwurf(entwurfKey)
      setSuccess(true)
      setSubmitting(false)
    } catch {
      Alert.alert('Netzwerkfehler', 'Das Angebot konnte nicht gesendet werden. Prüfen Sie Ihre Verbindung.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    )
  }

  if (ladenFehler) {
    return (
      <View style={[styles.center, { padding: 24, gap: 16 }]}>
        <Text style={styles.successTitle}>Laden fehlgeschlagen</Text>
        <Text style={styles.successText}>
          Die Ausschreibung konnte nicht geladen werden. Bitte prüfen Sie Ihre Verbindung und
          versuchen Sie es erneut.
        </Text>
        <Pressable
          style={styles.submitBtn}
          onPress={() => {
            setLoading(true)
            setLadenVersuch((n) => n + 1)
          }}
          accessibilityRole="button"
        >
          <Text style={styles.submitText}>Erneut versuchen</Text>
        </Pressable>
        <Pressable onPress={() => router.dismissTo(`/auftraege/${id}`)} accessibilityRole="button">
          <Text style={styles.gateHint}>Zurück zur Ausschreibung</Text>
        </Pressable>
      </View>
    )
  }

  if (nichtMoeglich) {
    return (
      <View style={[styles.center, { padding: 24, gap: 16 }]}>
        <Text style={{ fontSize: 40 }}>🔒</Text>
        <Text style={styles.successTitle}>Abgabe nicht möglich</Text>
        <Text style={styles.successText}>
          Für diese Ausschreibung können keine Angebote (mehr) abgegeben werden – die Frist ist
          abgelaufen oder sie ist nicht mehr veröffentlicht.
        </Text>
        <Pressable style={styles.submitBtn} onPress={() => router.dismissTo(`/auftraege/${id}`)}>
          <Text style={styles.submitText}>Zurück zur Ausschreibung</Text>
        </Pressable>
      </View>
    )
  }

  if (success) {
    return (
      <View style={[styles.center, { padding: 24, gap: 16 }]}>
        <Text style={{ fontSize: 48 }}>🎉</Text>
        <Text style={styles.successTitle}>Angebot eingereicht!</Text>
        <Text style={styles.successText}>
          Der Auftraggeber prüft Ihr Angebot und meldet sich bei Ihnen.
        </Text>
        {/* dismissTo statt replace: Das Ziel liegt bereits im Stack (wir sind ja
            von dort gekommen). replace legte einen ZWEITEN Eintrag derselben
            Route an — der native Zurück-Button sprang dann auf einen optisch
            identischen Screen und wirkte tot. dismissTo springt zum vorhandenen
            Eintrag zurück und ersetzt nur dann, wenn es ihn nicht gibt.
            Ziel ist das Auftragsdetail (wie nach Bearbeiten), damit der Status
            „bereits beworben" sofort sichtbar ist — nicht die Startliste. */}
        <Pressable style={styles.submitBtn} onPress={() => router.dismissTo(`/auftraege/${id}`)}>
          <Text style={styles.submitText}>Zurück zur Ausschreibung</Text>
        </Pressable>
        <AutoZurueck onAblauf={() => router.dismissTo(`/auftraege/${id}`)} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* automaticallyAdjustKeyboardInsets statt KeyboardAvoidingView: Mit der
          schwebenden Kopfzeile kompensierte 'padding' um die Header-Höhe zu
          wenig — der Einreichen-Button blieb hinter der iOS-Tastatur. */}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {wiederhergestellt ? (
          <View style={styles.entwurf}>
            <Text style={styles.entwurfText}>
              📝 Ihr Entwurf vom {entwurfZeitText(wiederhergestellt.am)} wurde wiederhergestellt.
              {wiederhergestellt.fehlendeDateien.length > 0
                ? ` Diese Dateien liegen nicht mehr auf dem Gerät – bitte erneut auswählen: ${wiederhergestellt.fehlendeDateien.join(', ')}.`
                : ''}
            </Text>
            <Pressable
              onPress={() => void entwurfVerwerfen()}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.entwurfVerwerfen}>Entwurf verwerfen</Text>
            </Pressable>
          </View>
        ) : null}

        {bindefrist ? (
          <View style={styles.bindefrist}>
            <Text style={styles.bindefristText}>
              ⏳ Ihr Angebot ist verbindlich bis{' '}
              <Text style={{ fontWeight: '700' }}>
                {new Date(bindefrist).toLocaleDateString('de-DE')}
              </Text>{' '}
              (Bindefrist).
            </Text>
          </View>
        ) : null}

        {/* Angebotsnummer */}
        <View style={sektionStyles.field}>
          <Text style={sektionStyles.label}>Angebotsnummer</Text>
          <TextInput
            style={sektionStyles.input}
            value={angebotsnummer}
            onChangeText={setAngebotsnummer}
            placeholder="z. B. 2026-001"
            placeholderTextColor={C.muted}
          />
        </View>

        <KalkulationSektion
          key={formGeneration}
          hatLv={hatLv}
          lvPositionen={lvPositionen}
          initialLvPreise={startLvPreise}
          initialPositionen={startPositionen}
          positionenVorgegeben={agIds.length > 0}
          vorgegebeneIds={agIds}
          onLvChange={(preise, summe) => {
            setLvPreise(preise)
            setGesamtpreis(summe)
          }}
          onPositionenChange={(pos, summe) => {
            setPositionen(pos)
            setGesamtpreis(summe)
          }}
        />

        <NachweisSektion
          kriterien={eignungskriterien}
          eignungsbestaetigung={eignungsbestaetigung}
          setEignungsbestaetigung={setEignungsbestaetigung}
          nachweisProfilMatch={nachweisProfilMatch}
          nachweisDateien={nachweisDateien}
          setNachweisDateien={setNachweisDateien}
          eingabenGesichert
        />

        <VerpflichtungenSektion
          verpflichtungen={verpflichtungen}
          bestaetigt={verpflichtungenBestaetigt}
          setBestaetigt={setVerpflichtungenBestaetigt}
          offen={verpflichtungenOffen}
          setOffen={setVerpflichtungenOffen}
        />

        <BasisFelder
          ausfuehrungszeitraum={ausfuehrungszeitraum}
          setAusfuehrungszeitraum={setAusfuehrungszeitraum}
          beschreibung={beschreibung}
          setBeschreibung={setBeschreibung}
          referenzen={referenzen}
          setReferenzen={setReferenzen}
        />

        <AnhaengeSektion anhaenge={anhaenge} setAnhaenge={setAnhaenge} />

        {/* Zusammenfassung + Absenden */}
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Angebotssumme netto</Text>
          <Text style={styles.summaryValue}>{fmtPreis(gesamtpreis)} €</Text>
        </View>

        <Pressable
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit || submitting, busy: submitting }}
        >
          <Text style={styles.submitText}>{submitting ? 'Wird eingereicht …' : 'Angebot einreichen'}</Text>
        </Pressable>
        {/* Benennt vor dem Absenden, was noch fehlt — statt eines
            kommentarlos gesperrten Knopfes (wie im Web). */}
        {!canSubmit && !submitting && offenePflichtangaben.length > 0 ? (
          <View style={styles.offenBox}>
            <Text style={styles.offenTitel}>Noch offen, um das Angebot abzuschicken:</Text>
            {offenePflichtangaben.map((o) => (
              <Text key={o} style={styles.offenPunkt}>
                •  {o}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  content: { padding: 16, gap: 20, paddingBottom: 48 },
  bindefrist: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 12,
  },
  bindefristText: { fontSize: 13, color: '#565244', lineHeight: 19 },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 16,
  },
  summaryLabel: { fontSize: 15, fontWeight: '500', color: C.muted },
  summaryValue: { fontSize: 22, fontWeight: '700', color: C.text },
  submitBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  gateHint: { fontSize: 12, color: C.muted, textAlign: 'center' },
  entwurf: {
    backgroundColor: C.ok,
    borderWidth: 1,
    borderColor: '#3a5a3e33',
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  entwurfText: { fontSize: 13, color: '#2f4a33', lineHeight: 19 },
  entwurfVerwerfen: { fontSize: 12, color: C.muted, textDecorationLine: 'underline' },
  offenBox: {
    backgroundColor: C.warn,
    borderWidth: 1,
    borderColor: '#c879414d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  offenTitel: { fontSize: 12, fontWeight: '600', color: '#8a4a1e' },
  offenPunkt: { fontSize: 12, color: '#8a4a1e', lineHeight: 18 },
  successTitle: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  successText: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22 },
})
