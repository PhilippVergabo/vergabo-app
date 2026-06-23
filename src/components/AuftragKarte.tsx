import { Pressable, StyleSheet, Text, View } from 'react-native'
import { budgetRange } from '@/lib/budgetRange'

const C = {
  primary: '#3a5a3e',
  accent: '#c87941',
  text: '#1a1a18',
  muted: '#6b6b60',
  border: '#ddd8cc',
  card: '#ffffff',
}

export type AuftragItem = {
  id: string
  titel: string
  gewerk: string | null
  ausfuehrungsort_plz: string | null
  ausfuehrungsort_ort: string | null
  frist: string | null
  budget_max: number | null
  created_at: string
}

type Props = {
  auftrag: AuftragItem
  beworben: boolean
  angebotPreis?: number | null
  onPress: () => void
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatBudget(max: number | null) {
  // Anbieter sehen nur die grobe Budget-Klasse (Basis budget_bis), nie exakte Werte.
  if (max == null) return null
  return budgetRange(max)
}

function formatPreis(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
}

export function AuftragKarte({ auftrag, beworben, angebotPreis, onPress }: Props) {
  const budget = formatBudget(auftrag.budget_max)
  const frist = formatDate(auftrag.frist)
  const ort = [auftrag.ausfuehrungsort_plz, auftrag.ausfuehrungsort_ort].filter(Boolean).join(' ')

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.titleRow}>
        <Text style={styles.titel} numberOfLines={2}>
          {auftrag.titel}
        </Text>
        {beworben && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Beworben</Text>
          </View>
        )}
      </View>

      {auftrag.gewerk ? <Text style={styles.gewerk}>{auftrag.gewerk}</Text> : null}

      <View style={styles.meta}>
        {ort ? <Text style={styles.metaText}>{'\u{1F4CD}'} {ort}</Text> : null}
        {frist ? <Text style={styles.metaText}>{'\u{1F4C5}'} Frist: {frist}</Text> : null}
        {budget ? <Text style={styles.metaText}>{'\u{1F4B6}'} {budget}</Text> : null}
        {beworben && angebotPreis != null ? (
          <Text style={styles.metaOffer}>
            {'\u{270D}\u{FE0F}'} Mein Angebot: {formatPreis(angebotPreis)} netto
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  cardPressed: {
    opacity: 0.82,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  titel: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    flex: 1,
  },
  badge: {
    backgroundColor: '#3a5a3e1a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#3a5a3e40',
  },
  badgeText: {
    fontSize: 11,
    color: C.primary,
    fontWeight: '600',
  },
  gewerk: {
    fontSize: 13,
    color: C.accent,
    fontWeight: '500',
  },
  meta: {
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    color: C.muted,
  },
  metaOffer: {
    fontSize: 13,
    color: C.primary,
    fontWeight: '600',
    marginTop: 2,
  },
})
