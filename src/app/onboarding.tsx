import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { VergaboLogo } from '@/components/VergaboLogo'
import { C } from '@/lib/theme'

// Versionierter Schlüssel: hochzählen setzt das Onboarding für alle einmalig zurück.
const ONBOARDING_FLAG = 'onboarding_gesehen_v2'

type Slide = { icon: string; titel: string; text: string; logo?: boolean }

const SLIDES: Slide[] = [
  {
    icon: '',
    logo: true,
    titel: 'Vergabo',
    text: 'Öffentliche Aufträge bis 25.000 € — einfach finden und rechtssicher vergeben. Speziell für Handwerksbetriebe und öffentliche Auftraggeber.',
  },
  {
    icon: '🔍',
    titel: 'Passende Aufträge finden',
    text: 'Sieh offene Ausschreibungen in deinem Gewerk und deiner Region — gefiltert, übersichtlich und auf einen Blick.',
  },
  {
    icon: '📨',
    titel: 'Mit wenigen Klicks bieten',
    text: 'Reiche dein Angebot direkt in der App ein: Kalkulation, Eignungsnachweise und Anhänge — fertig.',
  },
]

export default function OnboardingScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const [bereit, setBereit] = useState(false)
  const [index, setIndex] = useState(0)
  const listRef = useRef<FlatList<Slide>>(null)

  // Bereits gesehen? Dann direkt zum Login (kein erneutes Onboarding).
  useEffect(() => {
    let aktiv = true
    ;(async () => {
      const gesehen = await AsyncStorage.getItem(ONBOARDING_FLAG)
      if (!aktiv) return
      if (gesehen === 'true') {
        router.replace('/login')
      } else {
        setBereit(true)
      }
    })()
    return () => {
      aktiv = false
    }
  }, [router])

  async function fertig() {
    await AsyncStorage.setItem(ONBOARDING_FLAG, 'true')
    router.replace('/login')
  }

  function weiter() {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToOffset({ offset: (index + 1) * width, animated: true })
    } else {
      fertig()
    }
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width)
    setIndex(i)
  }

  if (!bereit) {
    // kurzer leerer Zustand, während der Flag geprüft wird (kein Flackern)
    return <View style={styles.container} />
  }

  const letzter = index === SLIDES.length - 1

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.skipRow}>
        {!letzter ? (
          <Pressable onPress={fertig} hitSlop={8}>
            <Text style={styles.skip}>Überspringen</Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            {item.logo ? (
              <View style={styles.logoBlock}>
                <VergaboLogo size={88} />
                <Text style={styles.wortmarke}>{item.titel}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.icon}>{item.icon}</Text>
                <Text style={styles.titel}>{item.titel}</Text>
              </>
            )}
            <Text style={styles.text}>{item.text}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index ? styles.dotAktiv : styles.dotInaktiv]} />
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={weiter}>
          <Text style={styles.primaryBtnText}>{letzter ? 'Los geht’s' : 'Weiter'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  skipRow: { height: 44, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 20 },
  skip: { fontSize: 14, color: C.muted, fontWeight: '600' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 20 },
  logoBlock: { alignItems: 'center', gap: 14 },
  wortmarke: { fontSize: 30, fontWeight: '700', color: C.primary, letterSpacing: 1 },
  icon: { fontSize: 72 },
  titel: { fontSize: 24, fontWeight: '700', color: C.text, textAlign: 'center' },
  text: { fontSize: 16, color: C.muted, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotAktiv: { backgroundColor: C.accent, width: 22 },
  dotInaktiv: { backgroundColor: C.border },
  footer: { paddingHorizontal: 24, paddingBottom: 12 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
