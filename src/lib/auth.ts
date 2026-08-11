import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase, SUPABASE_STORAGE_KEY } from '@/lib/supabase'

/**
 * Abmelden — auch ohne Netz.
 *
 * `supabase.auth.signOut()` ruft IMMER zuerst den /logout-Endpunkt auf (auch mit
 * `scope: 'local'`). Schlägt dieser Request fehl, kehrt auth-js zurück, BEVOR es
 * die Sitzung lokal verwirft (GoTrueClient._signOut): Ein Netzwerkfehler ist ein
 * `AuthRetryableFetchError` und fällt damit nicht unter die Ausnahmen für
 * 401/403/404. Ohne Verbindung blieb ein Tap auf „Abmelden" deshalb wirkungslos
 * — man blieb eingeloggt und konnte die App weiter benutzen.
 *
 * Deshalb im Fehlerfall den gespeicherten Sitzungseintrag selbst entfernen und
 * erneut abmelden: Der zweite Aufruf findet keine Sitzung mehr, überspringt den
 * Server-Call und feuert `SIGNED_OUT` — der Auth-Gate navigiert wie gewohnt.
 *
 * Bewusste Abwägung: Das Sitzungs-Token wird dabei serverseitig nicht widerrufen
 * (das geht offline nicht) und bleibt bis zum Ablauf gültig. Auf dem Gerät ist es
 * jedoch gelöscht — das ist es, was der Nutzer mit „Abmelden" bezweckt. Die
 * Alternative wäre, das Abmelden offline zu verweigern; jemanden gegen seinen
 * Willen eingeloggt zu lassen, wäre aber das schlechtere Verhalten.
 */
export async function abmelden(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (!error) return

  try {
    await AsyncStorage.removeItem(SUPABASE_STORAGE_KEY)
    await supabase.auth.signOut()
  } catch {
    // Selbst das lokale Verwerfen ist fehlgeschlagen — sonst bliebe der Tap
    // kommentarlos ohne Wirkung.
    Alert.alert(
      'Abmelden fehlgeschlagen',
      'Die Sitzung konnte nicht beendet werden. Bitte versuchen Sie es erneut.',
    )
  }
}

// Abmelden mit Rückfrage — verhindert, dass ein versehentlicher Tap auf
// "Abmelden" die Sitzung sofort beendet.
export function abmeldenMitBestaetigung() {
  Alert.alert('Abmelden', 'Möchten Sie sich wirklich abmelden?', [
    { text: 'Abbrechen', style: 'cancel' },
    {
      text: 'Abmelden',
      style: 'destructive',
      onPress: () => {
        void abmelden()
      },
    },
  ])
}
