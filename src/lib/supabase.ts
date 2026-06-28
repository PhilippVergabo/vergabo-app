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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: istWebSSR ? noopStorage : AsyncStorage,
    autoRefreshToken: !istWebSSR,
    persistSession: !istWebSSR,
    detectSessionInUrl: false,
  },
})
