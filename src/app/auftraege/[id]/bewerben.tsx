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
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from '@/lib/supabase'
import { PositionenEditor } from '@/components/PositionenEditor'
import { LvEditor } from '@/components/LvEditor'
import {
  NACHWEIS_TYP_LABELS,
  fmtPreis,
  validiereDatei,
  type Kriterium,
  type LvPosition,
  type LvPreis,
  type Position,
} from '@/lib/bewerbung'
import { API_URL } from '@/lib/config'
import { C } from '@/lib/theme'

type PickedFile = { uri: string; name: string; size: number; mimeType?: string }

function toFormFile(f: PickedFile) {
  return { uri: f.uri, name: f.name, type: f.mimeType ?? 'application/octet-stream' } as unknown as Blob
}

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

  async function dateiWaehlen(): Promise<PickedFile | null> {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      })
      if (res.canceled || !res.assets?.[0]) return null
      const a = res.assets[0]
      const file: PickedFile = { uri: a.uri, name: a.name, size: a.size ?? 0, mimeType: a.mimeType ?? undefined }
      const v = validiereDatei({ name: file.name, size: file.size })
      if (!v.ok) {
        Alert.alert('Datei abgelehnt', `${file.name}: ${v.fehler}`)
        return null
      }
      return file
    } catch (e) {
      Alert.alert('Dateiauswahl fehlgeschlagen', e instanceof Error ? e.message : String(e))
      return null
    }
  }

  async function nachweisWaehlen(kriteriumId: string) {
    const f = await dateiWaehlen()
    if (f) setNachweisDateien((prev) => ({ ...prev, [kriteriumId]: f }))
  }

  async function anhangWaehlen() {
    const f = await dateiWaehlen()
    if (f) setAnhaenge((prev) => [...prev, f])
  }

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
    beschreibung.trim().length > 0 &&
    pflichtKriterienErfuellt &&
    verpflichtungenAlleBestaetigt &&
    !submitting

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) {
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

      const res = await fetch(`${API_URL}/api/bewerbung/einreichen`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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
        <View style={styles.field}>
          <Text style={styles.label}>Angebotsnummer</Text>
          <TextInput
            style={styles.input}
            value={angebotsnummer}
            onChangeText={setAngebotsnummer}
            placeholder="z. B. 2026-001"
            placeholderTextColor={C.muted}
          />
        </View>

        {/* Kalkulation */}
        <View style={styles.field}>
          <Text style={styles.label}>
            {hatLv ? 'Leistungsverzeichnis – Einheitspreise' : 'Kalkulation'}
          </Text>
          {hatLv ? (
            <LvEditor
              positionen={lvPositionen}
              onChange={(preise, summe) => {
                setLvPreise(preise)
                setGesamtpreis(summe)
              }}
            />
          ) : (
            <PositionenEditor
              initialPositionen={agPositionen}
              onChange={(pos, summe) => {
                setPositionen(pos)
                setGesamtpreis(summe)
              }}
            />
          )}
        </View>

        {/* Eignungsnachweise */}
        {eignungskriterien.length > 0 ? (
          <View style={styles.field}>
            <Text style={styles.label}>Eignungsnachweis</Text>
            <View style={{ gap: 8 }}>
              {eignungskriterien.map((k) => {
                if (k.nachweis_erforderlich) {
                  const profilId = nachweisProfilMatch[k.id]
                  const datei = nachweisDateien[k.id]
                  if (profilId) {
                    return (
                      <View key={k.id} style={[styles.kriterium, styles.kriteriumOk]}>
                        <Text style={styles.checkOk}>✓</Text>
                        <Text style={styles.kriteriumText}>
                          {k.text}
                          {k.pflicht ? <Text style={styles.stern}> *</Text> : null}
                        </Text>
                        <Text style={styles.tag}>Aus Profil</Text>
                      </View>
                    )
                  }
                  return (
                    <View
                      key={k.id}
                      style={[styles.kriteriumCol, datei ? styles.kriteriumOk : styles.kriteriumWarn]}
                    >
                      <Text style={styles.kriteriumText}>
                        {k.text}
                        {k.pflicht ? <Text style={styles.stern}> *</Text> : null}
                      </Text>
                      {datei ? (
                        <View style={styles.dateiRow}>
                          <Text style={styles.dateiName}>✓ {datei.name}</Text>
                          <Pressable
                            onPress={() =>
                              setNachweisDateien((prev) => {
                                const n = { ...prev }
                                delete n[k.id]
                                return n
                              })
                            }
                          >
                            <Text style={styles.entfernen}>Entfernen</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View>
                          <Pressable style={styles.uploadBtn} onPress={() => nachweisWaehlen(k.id)}>
                            <Text style={styles.uploadBtnText}>📎 Nachweis hochladen</Text>
                          </Pressable>
                          {k.nachweis_typ ? (
                            <Text style={styles.erwartet}>
                              Erwartet: {NACHWEIS_TYP_LABELS[k.nachweis_typ] ?? k.nachweis_typ}
                            </Text>
                          ) : null}
                        </View>
                      )}
                    </View>
                  )
                }
                const checked = !!eignungsbestaetigung[k.id]
                return (
                  <Pressable
                    key={k.id}
                    style={[styles.kriterium, checked ? styles.kriteriumOk : styles.kriteriumNeutral]}
                    onPress={() =>
                      setEignungsbestaetigung((prev) => ({ ...prev, [k.id]: !prev[k.id] }))
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={k.text}
                  >
                    <Text style={checked ? styles.checkOk : styles.checkEmpty}>{checked ? '✓' : '○'}</Text>
                    <Text style={styles.kriteriumText}>
                      {k.text}
                      {k.pflicht ? <Text style={styles.stern}> *</Text> : null}
                    </Text>
                  </Pressable>
                )
              })}
              <Text style={styles.hint}>* Pflichtnachweis</Text>
            </View>
          </View>
        ) : null}

        {/* Verpflichtungserklärungen */}
        {verpflichtungen.length > 0 ? (
          <View style={styles.field}>
            <Text style={styles.label}>Verpflichtungserklärungen</Text>
            <View style={{ gap: 8 }}>
              {verpflichtungen.map((v, i) => {
                const checked = !!verpflichtungenBestaetigt[i]
                return (
                  <View
                    key={i}
                    style={[styles.kriteriumCol, checked ? styles.kriteriumOk : styles.kriteriumNeutral]}
                  >
                    <Pressable
                      style={styles.verpflHead}
                      onPress={() =>
                        setVerpflichtungenBestaetigt((prev) =>
                          prev.map((b, j) => (j === i ? !b : b)),
                        )
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={v.titel}
                    >
                      <Text style={checked ? styles.checkOk : styles.checkEmpty}>
                        {checked ? '✓' : '○'}
                      </Text>
                      <Text style={[styles.kriteriumText, { flex: 1 }]}>
                        {v.titel}
                        <Text style={styles.stern}> *</Text>
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setVerpflichtungenOffen((prev) => ({ ...prev, [i]: !prev[i] }))
                      }
                    >
                      <Text style={styles.textToggle}>
                        {verpflichtungenOffen[i] ? 'Text ausblenden' : 'Text anzeigen'}
                      </Text>
                    </Pressable>
                    {verpflichtungenOffen[i] ? <Text style={styles.verpflText}>{v.text}</Text> : null}
                  </View>
                )
              })}
              <Text style={styles.hint}>* Alle Erklärungen sind verbindlich zu bestätigen.</Text>
            </View>
          </View>
        ) : null}

        {/* Ausführungszeitraum */}
        <View style={styles.field}>
          <Text style={styles.label}>Ausführungszeitraum</Text>
          <TextInput
            style={styles.input}
            value={ausfuehrungszeitraum}
            onChangeText={setAusfuehrungszeitraum}
            placeholder="z. B. 01.08. – 15.08.2026"
            placeholderTextColor={C.muted}
          />
        </View>

        {/* Beschreibung */}
        <View style={styles.field}>
          <Text style={styles.label}>Kurzbeschreibung Ihres Angebots</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={beschreibung}
            onChangeText={setBeschreibung}
            placeholder="Wie gehen Sie die Aufgabe an?"
            placeholderTextColor={C.muted}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Referenzen */}
        <View style={styles.field}>
          <Text style={styles.label}>Referenzen (optional)</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={referenzen}
            onChangeText={setReferenzen}
            placeholder="Ähnliche Projekte …"
            placeholderTextColor={C.muted}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Anhänge */}
        <View style={styles.field}>
          <Text style={styles.label}>Anhänge (optional)</Text>
          <Pressable style={styles.uploadBtn} onPress={anhangWaehlen}>
            <Text style={styles.uploadBtnText}>📎 Datei hinzufügen</Text>
          </Pressable>
          {anhaenge.length > 0 ? (
            <View style={{ gap: 4, marginTop: 8 }}>
              {anhaenge.map((f, i) => (
                <View key={`${f.name}-${i}`} style={styles.dateiRow}>
                  <Text style={styles.dateiName}>📄 {f.name}</Text>
                  <Pressable onPress={() => setAnhaenge((prev) => prev.filter((_, j) => j !== i))}>
                    <Text style={styles.entfernen}>Entfernen</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.hint}>Erlaubt: PDF, PNG, JPG, DOCX, XLSX · max. 15 MB</Text>
        </View>

        {/* Zusammenfassung + Absenden */}
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Angebotssumme netto</Text>
          <Text style={styles.summaryValue}>{fmtPreis(gesamtpreis)} €</Text>
        </View>

        <Pressable
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
        >
          <Text style={styles.submitText}>{submitting ? 'Wird eingereicht …' : 'Angebot einreichen'}</Text>
        </Pressable>
        {!canSubmit && !submitting ? (
          <Text style={styles.gateHint}>
            Bitte Kalkulation, Ausführungszeitraum, Beschreibung sowie alle Pflichtnachweise und
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
  field: { gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  kriterium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  kriteriumCol: { padding: 12, borderRadius: 8, borderWidth: 1, gap: 8 },
  kriteriumOk: { borderColor: C.primary, backgroundColor: C.ok },
  kriteriumWarn: { borderColor: '#c8794166', backgroundColor: C.warn },
  kriteriumNeutral: { borderColor: C.border, backgroundColor: C.card },
  kriteriumText: { fontSize: 14, color: C.text, flexShrink: 1 },
  stern: { color: C.accent },
  checkOk: { fontSize: 16, color: C.primary, fontWeight: '700' },
  checkEmpty: { fontSize: 16, color: C.muted },
  tag: {
    fontSize: 11,
    color: C.primary,
    fontWeight: '600',
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: '#3a5a3e4d',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  dateiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dateiName: { fontSize: 13, color: C.primary, flexShrink: 1 },
  entfernen: { fontSize: 12, color: C.muted, textDecorationLine: 'underline' },
  uploadBtn: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: '#c8794166',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  uploadBtnText: { fontSize: 13, color: C.accent, fontWeight: '600' },
  erwartet: { fontSize: 12, color: C.accent, marginTop: 6 },
  verpflHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textToggle: { fontSize: 12, color: C.muted, textDecorationLine: 'underline' },
  verpflText: {
    fontSize: 13,
    color: '#3d3d38',
    lineHeight: 19,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
  },
  hint: { fontSize: 12, color: C.muted },
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
