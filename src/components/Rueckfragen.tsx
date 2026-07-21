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
import { C } from '@/lib/theme'

// Spiegel von vergabo/components/Rueckfragen.tsx (Web). Öffentliches Q&A zum
// Auftrag: Es werden nur Rollen-Badges gezeigt, keine Firmennamen (gewollt).
// Die RLS erlaubt Fragen auch schon VOR einer Bewerbung, solange der Auftrag
// veröffentlicht ist. Rollen-Badge bewusst über die auftraggeber_oeffentlich-
// user_id ermittelt (profiles ist Own-Row-RLS und für fremde Autoren leer).

type Rueckfrage = {
  id: string
  autor_id: string
  nachricht: string
  erstellt_am: string
}

function formatZeit(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
}

export function Rueckfragen({
  auftragId,
  onEingabeFokus,
}: {
  auftragId: string
  /** Optional: wird beim Fokussieren des Eingabefelds aufgerufen (Scroll-Anpassung). */
  onEingabeFokus?: () => void
}) {
  const [nachrichten, setNachrichten] = useState<Rueckfrage[]>([])
  const [nachricht, setNachricht] = useState('')
  const [laden, setLaden] = useState(true)
  const [senden, setSenden] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [agUserId, setAgUserId] = useState<string | null>(null)
  const [auftragTitel, setAuftragTitel] = useState('')

  const load = useCallback(async () => {
    const [{ data: sessionData }, { data: fragen }, { data: auftrag }] = await Promise.all([
      supabase.auth.getSession(),
      supabase
        .from('rückfragen')
        .select('id, autor_id, nachricht, erstellt_am')
        .eq('auftrag_id', auftragId)
        .order('erstellt_am', { ascending: true }),
      supabase.from('auftraege').select('titel, auftraggeber_id').eq('id', auftragId).single(),
    ])
    setUserId(sessionData.session?.user.id ?? null)
    setNachrichten((fragen as Rueckfrage[]) ?? [])
    setAuftragTitel(auftrag?.titel ?? '')
    if (auftrag?.auftraggeber_id) {
      const { data: ag } = await supabase
        .from('auftraggeber_oeffentlich')
        .select('user_id')
        .eq('id', auftrag.auftraggeber_id)
        .single()
      setAgUserId((ag?.user_id as string | null) ?? null)
    }
  }, [auftragId])

  useEffect(() => {
    load().finally(() => setLaden(false))
  }, [load])

  // Benachrichtigung an die andere Partei – Spiegel der Web-Logik; Fehler
  // hier bewusst still (die Rückfrage selbst ist bereits gespeichert).
  const benachrichtigen = useCallback(
    async (eigeneIstAuftraggeber: boolean) => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData.session?.access_token) return
        const post = (typ: string, empfaengerId: string) =>
          authedFetch('/api/benachrichtigung', {
            method: 'POST',
            body: JSON.stringify({
              typ,
              userId: empfaengerId,
              daten: { auftragTitel, link: `/auftraege/${auftragId}` },
            }),
          })
        if (!eigeneIstAuftraggeber) {
          // Anbieter fragt → Auftraggeber benachrichtigen
          if (agUserId) await post('rueckfrage', agUserId)
        } else {
          // Auftraggeber antwortet → alle Bieter benachrichtigen
          const { data: bews } = await supabase
            .from('bewerbungen')
            .select('anbieter_id')
            .eq('auftrag_id', auftragId)
          const anbIds = [...new Set((bews ?? []).map((b) => b.anbieter_id))]
          if (anbIds.length) {
            const { data: anbUsers } = await supabase
              .from('anbieter_oeffentlich')
              .select('user_id')
              .in('id', anbIds)
            for (const u of anbUsers ?? []) {
              if (u.user_id) await post('rueckfrage_antwort', u.user_id as string)
            }
          }
        }
      } catch {
        // still – Benachrichtigung ist Best-Effort
      }
    },
    [agUserId, auftragId, auftragTitel],
  )

  async function handleSenden() {
    const text = nachricht.trim()
    if (!text || !userId || senden) return
    setSenden(true)

    const { error } = await supabase.from('rückfragen').insert({
      auftrag_id: auftragId,
      autor_id: userId,
      nachricht: text,
    })

    if (error) {
      Alert.alert(
        'Senden fehlgeschlagen',
        'Die Rückfrage konnte nicht gesendet werden. Bitte später erneut versuchen.',
      )
      setSenden(false)
      return
    }

    setNachricht('')
    await load()
    await benachrichtigen(userId === agUserId)
    setSenden(false)
  }

  return (
    <View style={styles.card}>
      <View style={styles.kopfZeile}>
        <Text style={styles.cardTitle}>Rückfragen ({nachrichten.length})</Text>
        <Pressable
          onPress={() => load()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Rückfragen aktualisieren"
        >
          <Text style={styles.aktualisieren}>Aktualisieren</Text>
        </Pressable>
      </View>

      {laden ? (
        <ActivityIndicator color={C.primary} style={{ paddingVertical: 16 }} />
      ) : nachrichten.length === 0 ? (
        <Text style={styles.leerText}>
          Noch keine Rückfragen. Sie können auch vor der Angebotsabgabe Fragen stellen.
        </Text>
      ) : (
        <View style={styles.thread}>
          {nachrichten.map((msg) => {
            const istAuftraggeber = agUserId != null && msg.autor_id === agUserId
            const istEigene = msg.autor_id === userId
            return (
              <View
                key={msg.id}
                style={[styles.bubbleZeile, istEigene ? styles.zeileRechts : styles.zeileLinks]}
              >
                <View style={[styles.bubble, istAuftraggeber ? styles.bubbleAg : styles.bubbleAnb]}>
                  <Text style={styles.bubbleRolle}>
                    {istAuftraggeber ? '🏛️ Auftraggeber' : '🔧 Anbieter'}
                  </Text>
                  <Text style={styles.bubbleText}>{msg.nachricht}</Text>
                  <Text style={styles.bubbleZeit}>{formatZeit(msg.erstellt_am)}</Text>
                </View>
              </View>
            )
          })}
        </View>
      )}

      <View style={styles.eingabeZeile}>
        <TextInput
          style={styles.eingabe}
          value={nachricht}
          onChangeText={setNachricht}
          onFocus={onEingabeFokus}
          placeholder="Frage stellen oder antworten …"
          placeholderTextColor={C.muted}
          multiline
          returnKeyType="send"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={handleSenden}
          accessibilityLabel="Frage stellen oder antworten"
        />
        <Pressable
          style={[styles.sendenBtn, (!nachricht.trim() || senden) && styles.sendenBtnAus]}
          onPress={handleSenden}
          disabled={!nachricht.trim() || senden}
          accessibilityRole="button"
          accessibilityLabel="Rückfrage senden"
        >
          <Text style={styles.sendenText}>{senden ? '…' : 'Senden'}</Text>
        </Pressable>
      </View>
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
  thread: { gap: 10 },
  bubbleZeile: { flexDirection: 'row' },
  zeileLinks: { justifyContent: 'flex-start' },
  zeileRechts: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  bubbleAg: { backgroundColor: C.ok },
  bubbleAnb: { backgroundColor: C.field },
  bubbleRolle: { fontSize: 11, fontWeight: '600', color: C.muted, marginBottom: 3 },
  bubbleText: { fontSize: 14, color: C.text, lineHeight: 20 },
  bubbleZeit: { fontSize: 11, color: C.muted, marginTop: 4 },
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
})
