import 'react-native-url-polyfill/auto'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// Das Web-Static-Rendering (web.output: 'static') läuft in Node – dort gibt es
// kein `window`. AsyncStorage greift aber beim Init auf `window.localStorage` zu
// → "ReferenceError: window is not defined", was den Expo-Dev-Server/Build killt.
// Nur in diesem Fall (Web + kein window) keinen persistenten Storage verwenden;
// auf nativen Geräten und im Browser bleibt AsyncStorage unverändert aktiv.
const istWebSSR = Platform.OS === 'web' && typeof window === 'undefined'

const noopStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}

// Schlüssel, unter dem supabase-js die Sitzung ablegt. Bewusst explizit gesetzt
// statt sich auf die Ableitung der Bibliothek zu verlassen: Der Offline-Fallback
// beim Abmelden (lib/auth.ts) muss genau diesen Eintrag entfernen können.
// Die Formel ist identisch zur Bibliotheks-Vorgabe (`sb-<ref>-auth-token`) —
// bestehende Sitzungen bleiben dadurch gültig.
export const SUPABASE_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: istWebSSR ? noopStorage : AsyncStorage,
    storageKey: SUPABASE_STORAGE_KEY,
    autoRefreshToken: !istWebSSR,
    persistSession: !istWebSSR,
    detectSessionInUrl: false,
  },
})
