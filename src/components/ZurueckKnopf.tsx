import { useEffect } from 'react'
import { BackHandler, Platform, Pressable, Text } from 'react-native'
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
 * Gibt es keinen Vorgänger — z. B. nach einem Deeplink beim Kaltstart —,
 * führt er zu `ersatzZiel` statt ins Leere.
 *
 * Auf Android erscheint er NUR in diesem Fall (siehe `zurueckKnopfOptionen`)
 * und übernimmt dann auch die Zurück-Taste bzw. -Geste des Systems: Ohne
 * Vorgänger würde sie die App schließen, statt zur Übersicht zu führen.
 */
export function ZurueckKnopf({ ersatzZiel = '/' }: { ersatzZiel?: Href }) {
  const router = useRouter()

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false // normaler Weg zurück
      router.replace(ersatzZiel)
      return true
    })
    return () => sub.remove()
  }, [router, ersatzZiel])

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
 * Kopfzeilen-Optionen mit eigenem Zurück-Knopf.
 *
 * iOS: ersetzt den nativen Knopf immer (`unstable_headerLeftItems` gilt nur dort).
 *
 * Android: Der native Knopf funktioniert und bleibt — aber er erscheint nur,
 * wenn es einen Vorgänger gibt. Bis 21.10.2026 hatte die Auftragsseite für den
 * Fall ohne Vorgänger einen eigenen „‹ Übersicht“-Knopf; er fiel mit dem
 * Aufräumen der alten Knöpfe weg (App-PR #17), und auf Android stand die Seite
 * dann ohne Rückweg da. Deshalb hier: Gibt es einen Vorgänger, liefert
 * `headerLeft` nichts und der native Knopf bleibt sichtbar
 * (`@react-navigation/native-stack`: `hideBackButton` nur bei
 * `headerBackVisible === false`); gibt es keinen, steht unser Knopf dort.
 */
export function zurueckKnopfOptionen(ersatzZiel: Href = '/'): NativeStackNavigationOptions {
  if (Platform.OS === 'android') {
    return {
      headerLeft: ({ canGoBack }) => (canGoBack ? null : <ZurueckKnopf ersatzZiel={ersatzZiel} />),
    }
  }
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
