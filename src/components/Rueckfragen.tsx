import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/authedFetch'
import { meinAuftraggeberId } from '@/lib/mitgliedschaft'
import { C } from '@/lib/theme'

// Bieterfragen zum Auftrag — Spiegel von vergabo/components/Rueckfragen.tsx
// (Modell: vergabo/lib/bieterfragen.ts, seit 26.10.2026):
//
//   • Frage eines Betriebs: feste Nummer F-n. Bis zur Antwort sehen sie nur
//     der Betrieb des Fragestellers und die Vergabestelle (RLS), danach alle —
//     ohne Namen.
//   • Antwort der Vergabestelle hängt an genau einer Frage.
//   • Mitteilung der Vergabestelle ohne Frage: M-n.
//
// Gesendet wird über /api/rueckfrage: Dort entscheidet die Mitgliedschaft, wer
// was ist, und dort laufen die Benachrichtigungen (an alle Interessenten).
// Nummer, Art und Sichtbarkeit kommen aus der Datenbank; hier wird nur
// angeordnet — keine doppelt gehaltene Regel.

type Zeile = {
  id: string
  autor_id: string
  nachricht: string
  erstellt_am: string
  art: string | null
  nummer: number | null
  antwort_auf: string | null
  freigegeben_am: string | null
}

type Antwort = { id: string; text: string; erstelltAm: string }

type Eintrag = {
  id: string
  art: 'frage' | 'mitteilung' | 'antwort_ohne_frage'
  kennung: string
  text: string
  erstelltAm: string
  autorId: string
  freigegeben: boolean
  antworten: Antwort[]
}

function formatZeit(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
}

const zeit = (iso: string) => new Date(iso).getTime()

/** Fragen mit ihren Antworten, Mitteilungen, verwaiste Antworten — wie im Web. */
function ordne(zeilen: Zeile[]): Eintrag[] {
  const sortiert = [...zeilen].sort((a, b) => zeit(a.erstellt_am) - zeit(b.erstellt_am))
  const eintraege: Eintrag[] = []
  const nachId = new Map<string, Eintrag>()
  for (const z of sortiert) {
    if (z.art === 'antwort') continue
    const art = z.art === 'mitteilung' ? 'mitteilung' : 'frage'
    const e: Eintrag = {
      id: z.id,
      art,
      kennung: `${art === 'frage' ? 'F' : 'M'}-${z.nummer ?? '?'}`,
      text: z.nachricht,
      erstelltAm: z.erstellt_am,
      autorId: z.autor_id,
      freigegeben: art === 'mitteilung' || z.freigegeben_am != null,
      antworten: [],
    }
    eintraege.push(e)
    nachId.set(z.id, e)
  }
  for (const z of sortiert) {
    if (z.art !== 'antwort') continue
    const frage = z.antwort_auf ? nachId.get(z.antwort_auf) : undefined
    if (frage && frage.art === 'frage') {
      frage.antworten.push({ id: z.id, text: z.nachricht, erstelltAm: z.erstellt_am })
      frage.freigegeben = true
    } else {
      eintraege.push({
        id: z.id, art: 'antwort_ohne_frage', kennung: 'A', text: z.nachricht,
        erstelltAm: z.erstellt_am, autorId: z.autor_id, freigegeben: true, antworten: [],
      })
    }
  }
  return eintraege.sort((a, b) => zeit(a.erstelltAm) - zeit(b.erstelltAm))
}

function titelVon(e: Eintrag, eigene: boolean, ausMeinemBetrieb: boolean) {
  if (e.art === 'mitteilung') return 'Mitteilung der Vergabestelle'
  if (e.art === 'antwort_ohne_frage') return 'Antwort der Vergabestelle'
  return eigene ? 'Ihre Frage' : ausMeinemBetrieb ? 'Frage aus Ihrem Betrieb' : 'Frage eines Bieters'
}

export function Rueckfragen({
  auftragId,
  onEingabeFokus,
}: {
  auftragId: string
  /** Optional: wird beim Fokussieren des Eingabefelds aufgerufen (Scroll-Anpassung). */
  onEingabeFokus?: () => void
}) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [nachricht, setNachricht] = useState('')
  const [laden, setLaden] = useState(true)
  const [senden, setSenden] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  // Nur Oberfläche — /api/rueckfrage prüft die Mitgliedschaft selbst.
  const [istVergabestelle, setIstVergabestelle] = useState(false)
  // Vergabestelle: ID der beantworteten Frage oder 'mitteilung'.
  const [ziel, setZiel] = useState<string>('')

  const load = useCallback(async () => {
    const [{ data: sessionData }, { data: zeilen }, { data: auftrag }] = await Promise.all([
      supabase.auth.getSession(),
      supabase
        .from('rückfragen')
        .select('id, autor_id, nachricht, erstellt_am, art, nummer, antwort_auf, freigegeben_am')
        .eq('auftrag_id', auftragId)
        .order('erstellt_am', { ascending: true }),
      supabase.from('auftraege').select('auftraggeber_id').eq('id', auftragId).single(),
    ])
    const uid = sessionData.session?.user.id ?? null
    setUserId(uid)
    setEintraege(ordne((zeilen as Zeile[] | null) ?? []))
    if (uid && auftrag?.auftraggeber_id) {
      const meineStelle = await meinAuftraggeberId(uid)
      setIstVergabestelle(meineStelle === auftrag.auftraggeber_id)
    }
  }, [auftragId])

  useEffect(() => {
    // setLaden läuft im .finally() nach Auflösung des Promise – also asynchron,
    // nicht synchron im Effect-Body. Standard-Ladepattern, keine Kaskadenrenders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().finally(() => setLaden(false))
  }, [load])

  const offen = eintraege.filter((e) => e.art === 'frage' && e.antworten.length === 0)

  async function handleSenden() {
    const text = nachricht.trim()
    if (!text || !userId || senden) return
    if (istVergabestelle && !ziel) {
      Alert.alert('Antwort auf …', 'Bitte wählen Sie die Frage oder „Mitteilung an alle“.')
      return
    }
    setSenden(true)
    try {
      const res = await authedFetch('/api/rueckfrage', {
        method: 'POST',
        body: JSON.stringify({
          auftrag_id: auftragId,
          nachricht: text,
          ...(istVergabestelle
            ? ziel === 'mitteilung' ? { mitteilung: true } : { antwort_auf: ziel }
            : {}),
        }),
      })
      const antwort = (await res.json().catch(() => null)) as { error?: string; kennung?: string } | null
      if (!res.ok) {
        Alert.alert('Senden fehlgeschlagen', antwort?.error ?? 'Bitte später erneut versuchen.')
        return
      }
      if (!istVergabestelle) {
        Alert.alert(
          `Frage ${antwort?.kennung ?? ''} gesendet`,
          'Ihre Frage sehen zunächst nur die Vergabestelle und Ihr Betrieb. Mit der Antwort sehen alle Bieter Frage und Antwort – ohne Ihren Namen.',
        )
      }
      setNachricht('')
      setZiel('')
      await load()
    } catch {
      Alert.alert('Senden fehlgeschlagen', 'Keine Verbindung. Bitte später erneut versuchen.')
    } finally {
      setSenden(false)
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.kopfZeile}>
        <Text style={styles.cardTitle}>Bieterfragen ({eintraege.length})</Text>
        <Pressable
          onPress={() => load()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Bieterfragen aktualisieren"
        >
          <Text style={styles.aktualisieren}>Aktualisieren</Text>
        </Pressable>
      </View>

      {laden ? (
        <ActivityIndicator color={C.primary} style={{ paddingVertical: 16 }} />
      ) : eintraege.length === 0 ? (
        <Text style={styles.leerText}>
          Noch keine Bieterfragen. Sie können auch vor der Angebotsabgabe Fragen stellen.
        </Text>
      ) : (
        <View style={styles.liste}>
          {eintraege.map((e) => {
            const eigene = e.art === 'frage' && e.autorId === userId
            const istOffen = e.art === 'frage' && e.antworten.length === 0
            // Eine offene fremde Frage liefert die RLS einem Betrieb nur, wenn
            // sie aus seinem eigenen Betrieb stammt.
            const ausMeinemBetrieb = !istVergabestelle && e.art === 'frage' && !e.freigegeben && !eigene
            return (
              <View key={e.id} style={[styles.eintrag, e.art !== 'frage' && styles.eintragAg]}>
                <Text style={styles.kopf}>
                  <Text style={styles.kennung}>{e.kennung}</Text>
                  {'  '}{titelVon(e, eigene, ausMeinemBetrieb)} · {formatZeit(e.erstelltAm)}
                </Text>
                <Text style={styles.text}>{e.text}</Text>
                {e.antworten.map((a) => (
                  <View key={a.id} style={styles.antwort}>
                    <Text style={styles.kopf}>🏛️ Antwort der Vergabestelle · {formatZeit(a.erstelltAm)}</Text>
                    <Text style={styles.text}>{a.text}</Text>
                  </View>
                ))}
                {istOffen ? (
                  <Text style={styles.offen}>
                    {istVergabestelle
                      ? 'Noch nicht beantwortet – die übrigen Bieter sehen die Frage erst mit Ihrer Antwort.'
                      : 'Noch nicht beantwortet – nur für Ihren Betrieb und die Vergabestelle sichtbar.'}
                  </Text>
                ) : null}
              </View>
            )
          })}
        </View>
      )}

      {istVergabestelle ? (
        <View style={styles.zielBlock}>
          <Text style={styles.zielLabel}>Antwort auf</Text>
          <View style={styles.chips}>
            {offen.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setZiel(f.id)}
                style={[styles.chip, ziel === f.id && styles.chipAktiv]}
                accessibilityRole="button"
                accessibilityState={{ selected: ziel === f.id }}
              >
                <Text style={[styles.chipText, ziel === f.id && styles.chipTextAktiv]}>{f.kennung}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setZiel('mitteilung')}
              style={[styles.chip, ziel === 'mitteilung' && styles.chipAktiv]}
              accessibilityRole="button"
              accessibilityState={{ selected: ziel === 'mitteilung' }}
            >
              <Text style={[styles.chipText, ziel === 'mitteilung' && styles.chipTextAktiv]}>
                Mitteilung an alle
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.eingabeZeile}>
        <TextInput
          style={styles.eingabe}
          value={nachricht}
          onChangeText={setNachricht}
          onFocus={onEingabeFokus}
          placeholder={istVergabestelle ? 'Antwort oder Mitteilung …' : 'Frage an die Vergabestelle …'}
          placeholderTextColor={C.muted}
          multiline
          maxLength={4000}
          returnKeyType="send"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={handleSenden}
          accessibilityLabel={istVergabestelle ? 'Antwort oder Mitteilung' : 'Frage an die Vergabestelle'}
        />
        <Pressable
          style={[styles.sendenBtn, (!nachricht.trim() || senden) && styles.sendenBtnAus]}
          onPress={handleSenden}
          disabled={!nachricht.trim() || senden}
          accessibilityRole="button"
          accessibilityLabel="Senden"
        >
          <Text style={styles.sendenText}>{senden ? '…' : 'Senden'}</Text>
        </Pressable>
      </View>
      <Text style={styles.hinweis}>
        {istVergabestelle
          ? 'Antworten und Mitteilungen sehen alle Interessenten; sie werden benachrichtigt. Der Name des Fragestellers erscheint nie.'
          : 'Ihre Frage sehen zunächst nur die Vergabestelle und Ihr Betrieb. Mit der Antwort sehen alle Bieter Frage und Antwort – ohne Ihren Namen.'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  kopfZeile: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  aktualisieren: { fontSize: 12, fontWeight: '600', color: C.primary },
  leerText: { fontSize: 14, color: C.muted, textAlign: 'center', paddingVertical: 8 },
  liste: { gap: 10 },
  eintrag: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
    padding: 12,
    gap: 4,
  },
  eintragAg: { backgroundColor: C.ok, borderColor: '#3a5a3e33' },
  kopf: { fontSize: 11, color: C.muted },
  kennung: { fontSize: 12, fontWeight: '700', color: C.text },
  text: { fontSize: 14, color: C.text, lineHeight: 20 },
  antwort: {
    marginTop: 6,
    marginLeft: 6,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: C.primary,
    gap: 2,
  },
  offen: { fontSize: 12, color: C.accent, marginTop: 4 },
  zielBlock: { gap: 6 },
  zielLabel: { fontSize: 12, color: C.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.field,
  },
  chipAktiv: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.text, fontWeight: '600' },
  chipTextAktiv: { color: '#ffffff' },
  eingabeZeile: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  eingabe: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    backgroundColor: C.field,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
    maxHeight: 100,
  },
  sendenBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendenBtnAus: { opacity: 0.5 },
  sendenText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  hinweis: { fontSize: 12, color: C.muted, lineHeight: 17 },
})
