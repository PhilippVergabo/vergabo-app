import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { VergaboLogo } from '@/components/VergaboLogo'
import { C } from '@/lib/theme'

export default function RegistrierenAuswahl() {
  const router = useRouter()

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.brandBlock}>
        <VergaboLogo size={64} />
        <Text style={styles.brand}>Jetzt registrieren</Text>
        <Text style={styles.subtitle}>Wofür möchten Sie sich registrieren?</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
        onPress={() => router.push('/registrieren')}
      >
        <Text style={styles.optionIcon}>🛠️</Text>
        <Text style={styles.optionTitel}>Ich bin Anbieter</Text>
        <Text style={styles.optionText}>
          Handwerksbetrieb, der öffentliche Aufträge finden und Angebote abgeben möchte.
          Dauerhaft kostenlos.
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
        onPress={() => router.push('/registrieren-auftraggeber')}
      >
        <Text style={styles.optionIcon}>🏛️</Text>
        <Text style={styles.optionTitel}>Ich bin Auftraggeber</Text>
        <Text style={styles.optionText}>
          Kommune, Behörde oder Schule, die Aufträge rechtssicher nach UVgO vergeben möchte.
          In der Pilotphase kostenlos.
        </Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/login')} hitSlop={8} style={styles.loginLink}>
        <Text style={styles.loginLinkText}>Schon ein Konto? Zur Anmeldung</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: C.bg,
    padding: 24,
    gap: 16,
  },
  brandBlock: { alignItems: 'center', gap: 10, marginBottom: 8 },
  brand: { fontSize: 26, fontWeight: '700', color: C.primary, letterSpacing: 0.5 },
  subtitle: { fontSize: 14, color: C.muted, textAlign: 'center' },
  option: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 20,
    gap: 8,
  },
  optionPressed: { opacity: 0.85, borderColor: C.accent },
  optionIcon: { fontSize: 32 },
  optionTitel: { fontSize: 18, fontWeight: '700', color: C.text },
  optionText: { fontSize: 14, color: C.muted, lineHeight: 20 },
  loginLink: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  loginLinkText: { fontSize: 14, color: C.primary, fontWeight: '600' },
})
