import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'
import { meinAnbieterId, meinAuftraggeberId } from '@/lib/mitgliedschaft'

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

    // Die Profiltabellen haben seit der Mitgliedschafts-Migration KEIN user_id
    // mehr — der Filter traf deshalb nie eine Zeile und der Token wurde still
    // verworfen. Zielzeile jetzt über die Mitgliedschaft bestimmen.
    const profilId =
      profilTabelle === 'anbieter_profile'
        ? await meinAnbieterId(userId)
        : await meinAuftraggeberId(userId)
    if (!profilId) return

    await supabase.from(profilTabelle).update({ expo_push_token: token }).eq('id', profilId)
  } catch {
    // non-fatal — Push ist optional
  }
}

/**
 * Entfernt den Expo-Push-Token aus Anbieter- und Auftraggeber-Profil.
 * Aufruf vor dem Abmelden — sonst landen Pushes weiter auf dem Gerät.
 * Non-fatal und auch offline unproblematisch (dann bleibt der Token stehen).
 */
export async function loeschePushToken(): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession()
    const userId = sess.session?.user.id
    if (!userId) return

    const anbieterId = await meinAnbieterId(userId)
    if (anbieterId) {
      await supabase.from('anbieter_profile').update({ expo_push_token: null }).eq('id', anbieterId)
    }
    const auftraggeberId = await meinAuftraggeberId(userId)
    if (auftraggeberId) {
      await supabase
        .from('auftraggeber_profile')
        .update({ expo_push_token: null })
        .eq('id', auftraggeberId)
    }
  } catch {
    // non-fatal — Abmelden soll trotzdem weiterlaufen
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

// Whitelist für Push-Deeplinks: Auftragsdetails und Nachweisliste
// (/auftraege/<uuid>, /eigenerklarungen; optional mit Web-Anker — der Anker
// wird verworfen). Alles andere wird ignoriert, damit manipulierte
// Notification-Daten keine beliebige Navigation auslösen können.
const ERLAUBTER_PUSH_LINK = /^(\/auftraege\/[0-9a-f-]{36}|\/eigenerklarungen)(?:#[\w-]*)?$/

/**
 * Registriert einen Listener für das Antippen einer Push-Nachricht.
 * Ruft onTap mit dem `link` aus den Notification-Daten auf, aber nur wenn er
 * der Whitelist entspricht. Gibt eine Cleanup-Funktion zurück.
 */
export function addPushTapListener(onTap: (link: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const link = response.notification.request.content.data?.link
    const treffer = typeof link === 'string' ? link.match(ERLAUBTER_PUSH_LINK) : null
    if (treffer) onTap(treffer[1])
  })
  return () => sub.remove()
}
