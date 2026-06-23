import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { AnbieterHome } from '@/components/AnbieterHome'
import { AuftraggeberHome } from '@/components/AuftraggeberHome'

const C = { bg: '#f5f0e8', primary: '#3a5a3e', text: '#1a1a18', muted: '#6b6b60' }

// Rollen-Weiche: nach dem Login entscheidet profiles.rolle, welcher Home-Screen erscheint.
export default function HomeScreen() {
  const [rolle, setRolle] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let aktiv = true
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess.session?.user.id
      if (!userId) {
        if (aktiv) setRolle(null)
        return
      }
      const { data } = await supabase.from('profiles').select('rolle').eq('id', userId).single()
      if (aktiv) setRolle((data?.rolle as string) ?? null)
    })()
    return () => {
      aktiv = false
    }
  }, [])

  if (rolle === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    )
  }

  if (rolle === 'anbieter') return <AnbieterHome />
  if (rolle === 'auftraggeber') return <AuftraggeberHome />

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Konto nicht zugeordnet</Text>
      <Text style={styles.text}>
        Diese App ist für Anbieter und Auftraggeber. Bitte nutze die Web-Plattform unter vergabo.de.
      </Text>
      <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Abmelden</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: C.text },
  text: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  button: {
    marginTop: 8,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
})
