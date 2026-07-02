import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'

// Abmelden mit Rückfrage — verhindert, dass ein versehentlicher Tap auf
// "Abmelden" die Sitzung sofort beendet.
export function abmeldenMitBestaetigung() {
  Alert.alert('Abmelden', 'Möchten Sie sich wirklich abmelden?', [
    { text: 'Abbrechen', style: 'cancel' },
    {
      text: 'Abmelden',
      style: 'destructive',
      onPress: () => {
        supabase.auth.signOut()
      },
    },
  ])
}
