import { useEffect } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { C } from '@/lib/theme'

// Auffangroute für den Rücksprung der Sicherheitsprüfung
// (vergaboapp://turnstile?token=…).
//
// Regelfall: Das Safari-Auth-Fenster fängt den Rücksprung selbst ab — diese
// Route wird dann nie erreicht. Wird der Deeplink stattdessen an die App
// durchgereicht (auf iOS 26 beobachtet), zeigte expo-router bisher den
// „Unmatched Route"-Bildschirm.
//
// Den Token liest components/Turnstile.tsx über seinen Linking-Listener aus;
// hier bleibt nur, den Fehlerbildschirm zu vermeiden und zum Formular
// zurückzukehren.
export default function TurnstileRueckkehr() {
  useEffect(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/login')
  }, [])

  return <View style={{ flex: 1, backgroundColor: C.bg }} />
}
