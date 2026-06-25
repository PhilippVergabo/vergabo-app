import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { fmtPreis, type LvPosition, type LvPreis } from '@/lib/bewerbung'
import { C } from '@/lib/theme'

type Props = {
  positionen: LvPosition[]
  initialPreise?: LvPreis[]
  onChange: (preise: LvPreis[], gesamtsumme: number) => void
}

const typBadge: Record<LvPosition['typ'], string | null> = {
  normal: null,
  bedarf: 'Bedarf',
  alternativ: 'Alt.',
}

export function LvEditor({ positionen, initialPreise, onChange }: Props) {
  // Beim Bearbeiten bestehende Einheitspreise vorbefüllen (einmalig beim Mount).
  const [preise, setPreise] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const p of initialPreise ?? []) init[p.id] = p.einheitspreis
    return init
  })

  function emit(next: Record<string, number>) {
    const liste: LvPreis[] = positionen.map((pos) => {
      const ep = next[pos.id] ?? 0
      return { id: pos.id, einheitspreis: ep, gesamtpreis: Math.round(ep * pos.menge * 100) / 100 }
    })
    const summe = liste.reduce((s, p) => s + p.gesamtpreis, 0)
    onChange(liste, Math.round(summe * 100) / 100)
  }

  function setEp(id: string, value: number) {
    const next = { ...preise, [id]: value }
    setPreise(next)
    emit(next)
  }

  const gesamtsumme = positionen.reduce((s, pos) => s + (preise[pos.id] ?? 0) * pos.menge, 0)

  return (
    <View style={{ gap: 10 }}>
      {positionen.map((pos) => {
        const ep = preise[pos.id] ?? 0
        const badge = typBadge[pos.typ]
        return (
          <View key={pos.id} style={styles.row}>
            <View style={styles.head}>
              <Text style={styles.oz}>{pos.ordnungszahl}</Text>
              <Text style={styles.kurztext}>{pos.kurztext}</Text>
              {badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </View>
            {pos.langtext ? <Text style={styles.langtext}>{pos.langtext}</Text> : null}

            <View style={styles.mengeRow}>
              <Text style={styles.menge}>
                {pos.menge.toLocaleString('de-DE')} {pos.einheit}
              </Text>
            </View>

            <View style={styles.epRow}>
              <View style={styles.epGroup}>
                <Text style={styles.fieldLabel}>Einheitspreis €</Text>
                <TextInput
                  style={styles.epInput}
                  value={preise[pos.id] != null ? String(preise[pos.id]) : ''}
                  placeholder="0,00"
                  placeholderTextColor={C.muted}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  onChangeText={(t) => setEp(pos.id, parseFloat(t.replace(',', '.')) || 0)}
                />
              </View>
              <View style={styles.posGesamt}>
                <Text style={styles.fieldLabel}>Gesamt</Text>
                <Text style={styles.posGesamtValue}>{fmtPreis(ep * pos.menge)} €</Text>
              </View>
            </View>
          </View>
        )
      })}

      <View style={styles.summeRow}>
        <Text style={styles.summeLabel}>Gesamtsumme netto</Text>
        <Text style={styles.summeValue}>{fmtPreis(gesamtsumme)} €</Text>
      </View>
      <Text style={styles.hint}>
        ℹ️ Trage je Position den Einheitspreis ein. Gesamtpreise und Summe werden automatisch berechnet.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { backgroundColor: C.field, borderRadius: 10, padding: 12, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  oz: { fontSize: 12, color: C.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  kurztext: { fontSize: 14, color: C.text, fontWeight: '500', flexShrink: 1 },
  badge: { backgroundColor: '#fdf3ea', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11, color: C.accent, fontWeight: '600' },
  langtext: { fontSize: 12, color: C.muted, lineHeight: 17 },
  mengeRow: { flexDirection: 'row' },
  menge: { fontSize: 13, color: C.muted },
  epRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end', marginTop: 4 },
  epGroup: { flex: 1, gap: 4 },
  fieldLabel: { fontSize: 11, color: C.muted },
  epInput: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: C.text,
    textAlign: 'right',
  },
  posGesamt: { flex: 1, gap: 4, alignItems: 'flex-end' },
  posGesamtValue: { fontSize: 14, fontWeight: '700', color: C.text, paddingVertical: 8 },
  summeRow: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summeLabel: { fontSize: 14, fontWeight: '500', color: C.muted },
  summeValue: { fontSize: 18, fontWeight: '700', color: C.text },
  hint: { fontSize: 12, color: C.muted, lineHeight: 17 },
})
