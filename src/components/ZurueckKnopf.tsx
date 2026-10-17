import { Pressable, Text } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack'

/**
 * Eigener Zurück-Knopf für die Kopfzeile — ersetzt auf iOS den nativen.
 *
 * Warum: Unter iOS 26 war der native Zurück-Knopf zweimal eine leere Kapsel
 * ohne Funktion — in Build 8 (react-native-screens 4.16, Issue #3294) und am
 * 17.10.2026 wieder in Build 10 mit 4.23, nach dem OTA vom 16.10. (Tester-
 * Meldung, Auftragsdetail und Benachrichtigungen). Der Bibliotheks-Fix aus
 * 4.17 hat es also nicht zuverlässig beseitigt; andere Projekte haben den
 * nativen Knopf aus demselben Grund ersetzt.
 *
 * Ein eigener Knopf hängt nicht am nativen Zurück-Mechanismus, sondern ruft
 * selbst `router.back()` auf. `hidesSharedBackground` nimmt ihm die
 * Glas-Kapsel (ab iOS 26). Die Wischgeste vom linken Rand bleibt davon
 * unberührt.
 *
 * Gibt es keinen Vorgänger — z. B. nach einem Push-Tipp beim Kaltstart —,
 * führt er zu `ersatzZiel` statt ins Leere.
 */
export function ZurueckKnopf({ ersatzZiel = '/' }: { ersatzZiel?: Href }) {
  const router = useRouter()
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace(ersatzZiel))}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Zurück"
      style={{ paddingVertical: 6, paddingRight: 8 }}
    >
      <Text style={{ color: '#3a5a3e', fontSize: 17, fontWeight: '500' }}>‹ Zurück</Text>
    </Pressable>
  )
}

/**
 * Kopfzeilen-Optionen mit eigenem Zurück-Knopf (nur iOS, `unstable_headerLeftItems`
 * gilt nur dort). Auf Android bleibt der native Knopf.
 */
export function zurueckKnopfOptionen(ersatzZiel: Href = '/'): NativeStackNavigationOptions {
  return {
    unstable_headerLeftItems: () => [
      {
        type: 'custom',
        element: <ZurueckKnopf ersatzZiel={ersatzZiel} />,
        hidesSharedBackground: true,
      },
    ],
  }
}
