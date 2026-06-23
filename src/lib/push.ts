import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'

// Wie Push-Nachrichten angezeigt werden, wenn die App im Vordergrund läuft.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

/**
 * Fragt die Push-Berechtigung an, holt den Expo-Push-Token und speichert ihn im
 * eigenen anbieter_profile (RLS: Own-Row-Update erlaubt). No-op in Expo Go bzw.
 * ohne EAS-Projekt-ID oder ohne erteilte Berechtigung — bricht nie hart ab.
 */
export async function registriereFuerPush(): Promise<void> {
  try {
    if (!Device.isDevice) return // Push nur auf echten Geräten, nicht im Simulator

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Standard',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    const { status: vorhanden } = await Notifications.getPermissionsAsync()
    let status = vorhanden
    if (vorhanden !== 'granted') {
      const angefragt = await Notifications.requestPermissionsAsync()
      status = angefragt.status
    }
    if (status !== 'granted') return

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
    if (!projectId) return // ohne EAS-Projekt kein Token (z. B. in Expo Go)

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    if (!token) return

    const { data: sess } = await supabase.auth.getSession()
    const userId = sess.session?.user.id
    if (!userId) return

    await supabase.from('anbieter_profile').update({ expo_push_token: token }).eq('user_id', userId)
  } catch {
    // non-fatal — Push ist optional
  }
}

/**
 * Registriert einen Listener für das Antippen einer Push-Nachricht.
 * Ruft onTap mit dem `link` aus den Notification-Daten auf (z. B. /auftraege/<id>).
 * Gibt eine Cleanup-Funktion zurück.
 */
export function addPushTapListener(onTap: (link: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const link = response.notification.request.content.data?.link
    if (typeof link === 'string') onTap(link)
  })
  return () => sub.remove()
}
