import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { budgetRange } from '@/lib/budgetRange'
import { gewerkLabel } from '@/lib/labels'
import { Rueckfragen } from '@/components/Rueckfragen'
import { C } from '@/lib/theme'

type AuftragDetail = {
  id: string
  titel: string
  beschreibung: string | null
  gewerk: string | null
  ausfuehrungsort_plz: string | null
  ausfuehrungsort_ort: string | null
  frist: string | null
  budget_max: number | null
  status: string
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

export default function AuftragDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [auftrag, setAuftrag] = useState<AuftragDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [meineBewerbung, setMeineBewerbung] = useState<{ id: string; status: string } | null>(null)

  // Bei jedem Fokus neu laden — so erscheint nach dem Einreichen sofort der
  // "bereits beworben"-Status.
  useFocusEffect(
    useCallback(() => {
      let aktiv = true
      if (!id) return
      ;(async () => {
        const [{ data: a }, { data: b }] = await Promise.all([
          supabase
            .from('auftraege')
            .select(
              'id, titel, beschreibung, gewerk, ausfuehrungsort_plz, ausfuehrungsort_ort, frist:angebotsfrist, budget_max:budget_bis, status',
            )
            .eq('id', id)
            .single(),
          supabase.from('bewerbungen').select('id, status').eq('auftrag_id', id).limit(1),
        ])
        if (!aktiv) return
        setAuftrag(a as AuftragDetail | null)
        const meine = (b ?? [])[0] as { id: string; status: string } | undefined
        setMeineBewerbung(meine ?? null)
        setLoading(false)
      })()
      return () => {
        aktiv = false
      }
    }, [id]),
  )

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    )
  }

  if (!auftrag) {
    return (
      <View style={styles.center}>
        <Text style={styles.mutedText}>Ausschreibung nicht gefunden.</Text>
      </View>
    )
  }

  const ort = [auftrag.ausfuehrungsort_plz, auftrag.ausfuehrungsort_ort].filter(Boolean).join(' ')
  // Anbieter sehen nur die grobe Budget-Klasse (Basis budget_bis), nie exakte Werte.
  const budgetText = auftrag.budget_max != null ? budgetRange(auftrag.budget_max) : null
  // Angebote nur möglich, solange veröffentlicht UND die Angebotsfrist nicht
  // abgelaufen ist (konsistent zum Bearbeiten-Flow).
  const fristAbgelaufen = auftrag.frist ? new Date() >= new Date(auftrag.frist) : false
  const aktiv = auftrag.status === 'veroeffentlicht' && !fristAbgelaufen

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {auftrag.gewerk ? <Text style={styles.gewerk}>{gewerkLabel(auftrag.gewerk)}</Text> : null}
      <Text style={styles.titel}>{auftrag.titel}</Text>

      <View style={styles.metaBlock}>
        {ort ? <Row label="Ort" value={ort} /> : null}
        {auftrag.frist ? <Row label="Frist" value={formatDate(auftrag.frist)!} /> : null}
        {budgetText ? <Row label="Budget" value={budgetText} /> : null}
      </View>

      {auftrag.beschreibung ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beschreibung</Text>
          <Text style={styles.beschreibung}>{auftrag.beschreibung}</Text>
        </View>
      ) : null}

      <View style={styles.ctaBlock}>
        {meineBewerbung ? (
          <View style={{ gap: 12 }}>
            <View style={styles.beworbenBanner}>
              <Text style={styles.beworbenText}>Sie haben sich bereits beworben.</Text>
            </View>
            {aktiv && ['eingereicht', 'in_pruefung'].includes(meineBewerbung.status) ? (
              <Pressable
                style={styles.ctaButton}
                onPress={() => router.push(`/auftraege/${auftrag.id}/bearbeiten`)}
                accessibilityRole="button"
              >
                <Text style={styles.ctaButtonText}>Angebot bearbeiten</Text>
              </Pressable>
            ) : null}
          </View>
        ) : aktiv ? (
          <Pressable
            style={styles.ctaButton}
            onPress={() => router.push(`/auftraege/${auftrag.id}/bewerben`)}
            accessibilityRole="button"
          >
            <Text style={styles.ctaButtonText}>Angebot abgeben</Text>
          </Pressable>
        ) : (
          <View style={styles.beworbenBanner}>
            <Text style={styles.beworbenText}>Diese Ausschreibung nimmt keine Angebote mehr an.</Text>
          </View>
        )}
      </View>

      {/* Öffentliches Q&A – auch vor einer Bewerbung möglich (RLS erlaubt es
          für veröffentlichte Aufträge; nur Rollen-Badges, keine Firmennamen). */}
      <Rueckfragen auftragId={auftrag.id} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  mutedText: {
    color: C.muted,
    fontSize: 16,
  },
  gewerk: {
    fontSize: 12,
    color: C.accent,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  titel: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    lineHeight: 30,
  },
  metaBlock: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowLabel: {
    fontSize: 14,
    color: C.muted,
  },
  rowValue: {
    fontSize: 14,
    color: C.text,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  beschreibung: {
    fontSize: 15,
    color: C.text,
    lineHeight: 24,
  },
  ctaBlock: {
    marginTop: 8,
  },
  ctaButton: {
    backgroundColor: C.accent,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  beworbenBanner: {
    backgroundColor: '#3a5a3e18',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a5a3e40',
  },
  beworbenText: {
    fontSize: 15,
    color: C.primary,
    fontWeight: '500',
    textAlign: 'center',
  },
})
