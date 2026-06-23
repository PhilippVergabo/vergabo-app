import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { adressSuche, type AdressVorschlag } from '@/lib/adressSuche'

const C = {
  bg: '#f5f0e8',
  primary: '#3a5a3e',
  text: '#1a1a18',
  muted: '#6b6b60',
  border: '#ddd8cc',
  card: '#ffffff',
}

type Props = {
  value: string
  /** Freitext-Eingabe (Rohtext). */
  onChange: (strasse: string) => void
  /** Auswahl eines Vorschlags → strukturierte Adresse inkl. Koordinaten. */
  onSelect: (vorschlag: AdressVorschlag) => void
  placeholder?: string
}

/**
 * Adresseingabe mit Vorschlägen aus der Photon-API (Komoot/OSM). Reines Augment:
 * Lädt die Suche nicht oder schlägt sie fehl, bleibt es ein normales Textfeld.
 * Vorschläge erscheinen inline unter dem Feld (robust innerhalb von ScrollViews).
 */
export function AdressAutocomplete({ value, onChange, onSelect, placeholder }: Props) {
  const [vorschlaege, setVorschlaege] = useState<AdressVorschlag[]>([])
  const [offen, setOffen] = useState(false)
  const [laden, setLaden] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Verhindert, dass die Auswahl (die `value` ändert) sofort wieder eine Suche auslöst.
  const geradeGewaehlt = useRef(false)

  useEffect(() => {
    if (geradeGewaehlt.current) {
      geradeGewaehlt.current = false
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      const q = value.trim()
      abortRef.current?.abort()

      if (q.length < 3) {
        setVorschlaege([])
        setOffen(false)
        return
      }

      const ctrl = new AbortController()
      abortRef.current = ctrl
      setLaden(true)
      try {
        const res = await adressSuche(q, ctrl.signal)
        setVorschlaege(res)
        setOffen(res.length > 0)
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          setVorschlaege([])
          setOffen(false)
        }
      } finally {
        setLaden(false)
      }
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  function waehle(v: AdressVorschlag) {
    geradeGewaehlt.current = true
    onSelect(v)
    setOffen(false)
    setVorschlaege([])
  }

  return (
    <View>
      <View>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {laden ? <ActivityIndicator style={styles.spinner} size="small" color={C.muted} /> : null}
      </View>

      {offen && vorschlaege.length > 0 ? (
        <View style={styles.list}>
          {vorschlaege.map((v, i) => (
            <Pressable
              key={v.id}
              style={[styles.item, i < vorschlaege.length - 1 && styles.itemBorder]}
              onPress={() => waehle(v)}
            >
              <Text style={styles.itemText} numberOfLines={2}>
                {v.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: C.text,
  },
  spinner: { position: 'absolute', right: 12, top: 0, bottom: 0 },
  list: {
    marginTop: 4,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  item: { paddingHorizontal: 12, paddingVertical: 11 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  itemText: { fontSize: 14, color: C.text },
})
