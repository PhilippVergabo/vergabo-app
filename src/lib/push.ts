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
 * Fragt die Push-Berechtigung an und holt den Expo-Push-Token.
 * null in Expo Go, im Simulator, ohne EAS-Projekt-ID oder ohne Berechtigung.
 */
async function holeExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null // Push nur auf echten Geräten, nicht im Simulator

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
  if (status !== 'granted') return null

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
  if (!projectId) return null // ohne EAS-Projekt kein Token (z. B. in Expo Go)

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
  return token ?? null
}

/**
 * Speichert den Push-Token im eigenen Profil (RLS: Own-Row-Update erlaubt).
 * No-op ohne Token/Session — bricht nie hart ab.
 *
 * @param profilTabelle Zieltabelle für den Token (Anbieter oder Auftraggeber).
 */
export async function registriereFuerPush(
  profilTabelle: 'anbieter_profile' | 'auftraggeber_profile' = 'anbieter_profile',
): Promise<void> {
  try {
    const token = await holeExpoPushToken()
    if (!token) return

    const { data: sess } = await supabase.auth.getSession()
    const userId = sess.session?.user.id
    if (!userId) return

    await supabase.from(profilTabelle).update({ expo_push_token: token }).eq('user_id', userId)
  } catch {
    // non-fatal — Push ist optional
  }
}

/**
 * Registriert den Push-Token eines ADMINS über die Bearer-API der Web-Plattform
 * (admins-Tabelle ist nicht per RLS beschreibbar). Aufruf erst NACH dem
 * 2FA-Schritt im Admin-Bereich — die Route verlangt aal2. Non-fatal.
 */
export async function registriereAdminPush(): Promise<void> {
  try {
    const token = await holeExpoPushToken()
    if (!token) return
    const { authedFetch } = await import('@/lib/authedFetch')
    await authedFetch('/api/app-admin/push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  } catch {
    // non-fatal — Push ist optional
  }
}

// Whitelist für Push-Deeplinks: ausschließlich Auftragsdetails
// (/auftraege/<uuid>). Alles andere wird ignoriert, damit manipulierte
// Notification-Daten keine beliebige Navigation auslösen können.
const ERLAUBTER_PUSH_LINK = /^\/auftraege\/[0-9a-f-]{36}$/

/**
 * Registriert einen Listener für das Antippen einer Push-Nachricht.
 * Ruft onTap mit dem `link` aus den Notification-Daten auf, aber nur wenn er
 * der Whitelist entspricht (/auftraege/<uuid>). Gibt eine Cleanup-Funktion zurück.
 */
export function addPushTapListener(onTap: (link: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const link = response.notification.request.content.data?.link
    if (typeof link === 'string' && ERLAUBTER_PUSH_LINK.test(link)) onTap(link)
  })
  return () => sub.remove()
}
