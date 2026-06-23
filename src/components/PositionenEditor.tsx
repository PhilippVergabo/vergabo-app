import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { EINHEITEN, fmtPreis, type Position } from '@/lib/bewerbung'

const C = {
  primary: '#3a5a3e',
  accent: '#c87941',
  text: '#1a1a18',
  muted: '#6b6b60',
  border: '#ddd8cc',
  field: '#f5f0e8',
  card: '#ffffff',
}

const defaultPositionen: Position[] = [
  { id: '1', beschreibung: 'Arbeitszeit', menge: 1, einheit: 'Stunden', einzelpreis: 0, gesamt: 0 },
  { id: '2', beschreibung: 'Anfahrtspauschale', menge: 1, einheit: 'Pauschale', einzelpreis: 0, gesamt: 0 },
  { id: '3', beschreibung: 'Material', menge: 1, einheit: 'Stück', einzelpreis: 0, gesamt: 0 },
]

type Props = {
  initialPositionen?: Position[]
  onChange: (positionen: Position[], gesamt: number) => void
}

function summe(positionen: Position[]) {
  return positionen.reduce((s, p) => s + p.gesamt, 0)
}

export function PositionenEditor({ initialPositionen, onChange }: Props) {
  const [positionen, setPositionen] = useState<Position[]>(
    initialPositionen && initialPositionen.length > 0 ? initialPositionen : defaultPositionen,
  )

  function emit(next: Position[]) {
    setPositionen(next)
    onChange(next, summe(next))
  }

  function updatePosition(id: string, field: keyof Position, value: string | number) {
    emit(
      positionen.map((p) => {
        if (p.id !== id) return p
        const neu = { ...p, [field]: value }
        if (field === 'menge' || field === 'einzelpreis') {
          neu.gesamt = Number(neu.menge) * Number(neu.einzelpreis)
        }
        return neu
      }),
    )
  }

  function hinzufuegen() {
    emit([
      ...positionen,
      { id: `${Date.now()}`, beschreibung: '', menge: 1, einheit: 'Stück', einzelpreis: 0, gesamt: 0 },
    ])
  }

  function loeschen(id: string) {
    emit(positionen.filter((p) => p.id !== id))
  }

  function zyklusEinheit(id: string, aktuell: string) {
    const idx = EINHEITEN.indexOf(aktuell)
    const next = EINHEITEN[(idx + 1) % EINHEITEN.length]
    updatePosition(id, 'einheit', next)
  }

  return (
    <View style={{ gap: 12 }}>
      {positionen.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={styles.rowHead}>
            <TextInput
              style={styles.beschreibung}
              value={p.beschreibung}
              placeholder="Beschreibung"
              placeholderTextColor={C.muted}
              onChangeText={(t) => updatePosition(p.id, 'beschreibung', t)}
            />
            <Pressable onPress={() => loeschen(p.id)} hitSlop={8} style={styles.del}>
              <Text style={styles.delText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.fieldsRow}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Menge</Text>
              <TextInput
                style={styles.numInput}
                value={String(p.menge)}
                keyboardType="decimal-pad"
                selectTextOnFocus
                onChangeText={(t) => updatePosition(p.id, 'menge', parseFloat(t.replace(',', '.')) || 0)}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Einheit</Text>
              <Pressable style={styles.einheitBtn} onPress={() => zyklusEinheit(p.id, p.einheit)}>
                <Text style={styles.einheitText}>{p.einheit}</Text>
              </Pressable>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Einzelpreis €</Text>
              <TextInput
                style={styles.numInput}
                value={String(p.einzelpreis)}
                keyboardType="decimal-pad"
                selectTextOnFocus
                onChangeText={(t) => updatePosition(p.id, 'einzelpreis', parseFloat(t.replace(',', '.')) || 0)}
              />
            </View>
          </View>

          <View style={styles.gesamtRow}>
            <Text style={styles.gesamtLabel}>Gesamt</Text>
            <Text style={styles.gesamtValue}>{fmtPreis(p.gesamt)} €</Text>
          </View>
        </View>
      ))}

      <Pressable onPress={hinzufuegen} hitSlop={6}>
        <Text style={styles.add}>+ Weitere Position hinzufügen</Text>
      </Pressable>

      <View style={styles.summeRow}>
        <Text style={styles.summeLabel}>Gesamtbetrag netto</Text>
        <Text style={styles.summeValue}>{fmtPreis(summe(positionen))} €</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { backgroundColor: C.field, borderRadius: 10, padding: 12, gap: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  beschreibung: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: C.text,
  },
  del: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  delText: { fontSize: 16, color: C.muted },
  fieldsRow: { flexDirection: 'row', gap: 8 },
  fieldGroup: { flex: 1, gap: 4 },
  fieldLabel: { fontSize: 11, color: C.muted },
  numInput: {
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
  einheitBtn: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  einheitText: { fontSize: 14, color: C.primary, fontWeight: '500' },
  gesamtRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8 },
  gesamtLabel: { fontSize: 12, color: C.muted },
  gesamtValue: { fontSize: 14, fontWeight: '700', color: C.text },
  add: { fontSize: 14, color: C.accent, fontWeight: '600', paddingVertical: 6 },
  summeRow: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summeLabel: { fontSize: 14, fontWeight: '500', color: C.muted },
  summeValue: { fontSize: 20, fontWeight: '700', color: C.text },
})
