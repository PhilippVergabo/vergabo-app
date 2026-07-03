import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { AnhaengeSektion } from '@/components/angebot/AnhaengeSektion'
import { BasisFelder } from '@/components/angebot/BasisFelder'
import { KalkulationSektion } from '@/components/angebot/KalkulationSektion'
import { NachweisSektion } from '@/components/angebot/NachweisSektion'
import { VerpflichtungenSektion } from '@/components/angebot/VerpflichtungenSektion'
import { sektionStyles } from '@/components/angebot/sektionStyles'
import {
  fmtPreis,
  toFormFile,
  type Kriterium,
  type LvPosition,
  type LvPreis,
  type PickedFile,
  type Position,
} from '@/lib/bewerbung'
import { authedFetch } from '@/lib/authedFetch'
import { C } from '@/lib/theme'

export default function BewerbenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
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
  const [agPositionen, setAgPositionen] = useState<Position[]>([])
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

  useEffect(() => {
    if (!id) return
    let aktiv = true

    async function laden() {
      const { data } = await supabase
        .from('auftraege')
        .select(
          'status, angebotsfrist, eignungskriterien, verpflichtungserklaerungen, hat_leistungsverzeichnis, leistungsverzeichnis, kostenschaetzung, bindefrist',
        )
        .eq('id', id)
        .single()
      if (!aktiv || !data) {
        setLoading(false)
        return
      }

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

      const kriterien = (data.eignungskriterien ?? []) as Kriterium[]
      const verpfl = (data.verpflichtungserklaerungen ?? []) as { titel: string; text: string }[]
      setVerpflichtungen(verpfl)
      setVerpflichtungenBestaetigt(verpfl.map(() => false))

      const lvPos = (data.leistungsverzeichnis ?? []) as LvPosition[]
      const ksPos = (data.kostenschaetzung ?? []) as {
        id?: string | number
        beschreibung?: string
        menge?: number
        einheit?: string
      }[]

      if (data.hat_leistungsverzeichnis && lvPos.length > 0) {
        setHatLv(true)
        setLvPositionen(lvPos)
      } else if (ksPos.length > 0) {
        // Positionen des Auftraggebers als Startliste — OHNE dessen Preise.
        setAgPositionen(
          ksPos.map((p, i) => ({
            id: String(p.id ?? i + 1),
            beschreibung: p.beschreibung ?? '',
            menge: Number(p.menge) || 1,
            einheit: p.einheit ?? 'Stück',
            einzelpreis: 0,
            gesamt: 0,
          })),
        )
      }

      // Anbieter-Profil + verifizierte Eigenerklärungen für Profil-Abgleich
      const { data: sess } = await supabase.auth.getSession()
      if (sess.session) {
        const { data: ap } = await supabase
          .from('anbieter_profile')
          .select('id')
          .eq('user_id', sess.session.user.id)
          .single()
        if (ap) {
          const { count } = await supabase
            .from('bewerbungen')
            .select('id', { count: 'exact', head: true })
            .eq('anbieter_id', ap.id)
          const nr = ((count ?? 0) + 1).toString().padStart(3, '0')
          setAngebotsnummer(`${new Date().getFullYear()}-${nr}`)

          const { data: eks } = await supabase
            .from('eigenerklarungen')
            .select('id, typ, admin_verifiziert')
            .eq('anbieter_id', ap.id)
            .eq('admin_verifiziert', true)

          const autoBest: Record<string, boolean> = {}
          const nachweisMap: Record<string, string | null> = {}
          for (const k of kriterien) {
            const passend = eks?.find(
              (e) =>
                e.typ === k.id ||
                (k.nachweis_typ && e.typ === k.nachweis_typ) ||
                e.typ === k.text?.toLowerCase().replace(/\s+/g, '_') ||
                k.text?.toLowerCase().includes(e.typ.toLowerCase()),
            )
            if (k.nachweis_erforderlich) nachweisMap[k.id] = passend?.id ?? null
            else if (passend) autoBest[k.id] = true
          }
          if (!aktiv) return
          setNachweisProfilMatch(nachweisMap)
          setEignungsbestaetigung(autoBest)
        }
      }

      setEignungskriterien(kriterien)
      setLoading(false)
    }

    laden()
    return () => {
      aktiv = false
    }
  }, [id])

  const pflichtKriterienErfuellt = eignungskriterien
    .filter((k) => k.pflicht)
    .every((k) => {
      if (k.nachweis_erforderlich) return !!nachweisProfilMatch[k.id] || !!nachweisDateien[k.id]
      return !!eignungsbestaetigung[k.id]
    })

  const verpflichtungenAlleBestaetigt = verpflichtungen.every((_, i) => verpflichtungenBestaetigt[i])

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

  if (nichtMoeglich) {
    return (
      <View style={[styles.center, { padding: 24, gap: 16 }]}>
        <Text style={{ fontSize: 40 }}>🔒</Text>
        <Text style={styles.successTitle}>Abgabe nicht möglich</Text>
        <Text style={styles.successText}>
          Für diese Ausschreibung können keine Angebote (mehr) abgegeben werden – die Frist ist
          abgelaufen oder sie ist nicht mehr veröffentlicht.
        </Text>
        <Pressable style={styles.submitBtn} onPress={() => router.replace(`/auftraege/${id}`)}>
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
        <Pressable style={styles.submitBtn} onPress={() => router.replace('/')}>
          <Text style={styles.submitText}>Zurück zur Übersicht</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          hatLv={hatLv}
          lvPositionen={lvPositionen}
          initialPositionen={agPositionen}
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
        {!canSubmit && !submitting ? (
          <Text style={styles.gateHint}>
            Bitte Kalkulation, Ausführungszeitraum sowie alle Pflichtnachweise und
            Verpflichtungserklärungen ausfüllen.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
  successTitle: { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center' },
  successText: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22 },
})
