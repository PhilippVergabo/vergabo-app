import { useEffect, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { C } from '@/lib/theme'

// Anhänge des Auftraggebers (Vergabeunterlagen) im Auftragsdetail — Spiegel der
// Web-Komponente components/AuftragAnhaenge.tsx (nur Lesen, kein Upload).
// Öffnen über eine kurzlebige Signed-URL im System-Browser (kein natives Modul
// nötig — läuft auch in älteren Dev-Builds).

type StorageDatei = {
  name: string
  id: string | null
  metadata?: { size?: number } | null
}

function dateiIcon(name: string): string {
  if (name.endsWith('.pdf')) return '📄'
  if (/\.(jpg|jpeg|png|gif)$/i.test(name)) return '🖼️'
  if (/\.(doc|docx)$/i.test(name)) return '📝'
  return '📎'
}

function dateiGroesse(bytes: number): string {
  if (bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AuftragAnhaenge({ auftragId }: { auftragId: string }) {
  const [anhaenge, setAnhaenge] = useState<StorageDatei[]>([])

  useEffect(() => {
    let aktiv = true
    ;(async () => {
      const { data } = await supabase.storage.from('auftrag-anhaenge').list(auftragId)
      if (!aktiv) return
      // Nur echte Dateien: list() liefert Unterordner mit id === null, die
      // nicht herunterladbar wären (gleicher Filter wie im Web-Fix).
      setAnhaenge(((data ?? []) as StorageDatei[]).filter((d) => d.id !== null))
    })()
    return () => {
      aktiv = false
    }
  }, [auftragId])

  async function oeffnen(name: string) {
    const { data } = await supabase.storage
      .from('auftrag-anhaenge')
      .createSignedUrl(`${auftragId}/${name}`, 60)
    if (!data?.signedUrl) {
      Alert.alert('Fehler', 'Die Datei konnte nicht geöffnet werden. Bitte versuchen Sie es erneut.')
      return
    }
    void Linking.openURL(data.signedUrl)
  }

  // Keine leere Karte anzeigen — Aufträge ohne Anhänge bleiben unverändert.
  if (anhaenge.length === 0) return null

  return (
    <View style={styles.card}>
      <Text style={styles.titel}>Anhänge ({anhaenge.length})</Text>
      {anhaenge.map((a) => (
        <Pressable
          key={a.name}
          style={({ pressed }) => [styles.zeile, pressed && styles.zeileGedrueckt]}
          onPress={() => void oeffnen(a.name)}
          accessibilityRole="button"
          accessibilityLabel={`Anhang ${a.name} öffnen`}
        >
          <Text style={styles.icon}>{dateiIcon(a.name)}</Text>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {a.name}
            </Text>
            {dateiGroesse(a.metadata?.size ?? 0) ? (
              <Text style={styles.groesse}>{dateiGroesse(a.metadata?.size ?? 0)}</Text>
            ) : null}
          </View>
          <Text style={styles.oeffnenText}>Öffnen ›</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 10,
  },
  titel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
  },
  zeileGedrueckt: { opacity: 0.7, borderColor: C.primary },
  icon: { fontSize: 20 },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: C.text },
  groesse: { fontSize: 12, color: C.muted, marginTop: 1 },
  oeffnenText: { fontSize: 13, fontWeight: '600', color: C.primary },
})
