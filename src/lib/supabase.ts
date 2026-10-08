import 'react-native-url-polyfill/auto'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { createClient, type SupportedStorage } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// Das Web-Static-Rendering (web.output: 'static') läuft in Node – dort gibt es
// kein `window`. AsyncStorage greift aber beim Init auf `window.localStorage` zu
// → "ReferenceError: window is not defined", was den Expo-Dev-Server/Build killt.
// Nur in diesem Fall (Web + kein window) keinen persistenten Storage verwenden.
const istWebSSR = Platform.OS === 'web' && typeof window === 'undefined'
const istNative = Platform.OS === 'ios' || Platform.OS === 'android'

const noopStorage: SupportedStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}

// SecureStore lehnt große Werte ab (historisch ~2048 Bytes auf manchen iOS-
// Versionen). Eine Supabase-Sitzung (JWT + Refresh + User) ist oft größer —
// deshalb in Chunks legen. Schlüssel: `${key}.n` = Anzahl, `${key}.${i}` = Teil.
const CHUNK_SIZE = 1800

async function secureGetItem(key: string): Promise<string | null> {
  const anzahlRoh = await SecureStore.getItemAsync(`${key}.n`)
  if (anzahlRoh) {
    const anzahl = Number.parseInt(anzahlRoh, 10)
    if (!Number.isFinite(anzahl) || anzahl < 1) return null
    const teile: string[] = []
    for (let i = 0; i < anzahl; i++) {
      const teil = await SecureStore.getItemAsync(`${key}.${i}`)
      if (teil == null) return null
      teile.push(teil)
    }
    return teile.join('')
  }

  // Ältere Einzel-Keys oder Migration aus AsyncStorage (vor SecureStore).
  const einzeln = await SecureStore.getItemAsync(key)
  if (einzeln != null) return einzeln

  const legacy = await AsyncStorage.getItem(key)
  if (legacy != null) {
    await secureSetItem(key, legacy)
    await AsyncStorage.removeItem(key)
    return legacy
  }
  return null
}

async function secureSetItem(key: string, value: string): Promise<void> {
  const altRoh = await SecureStore.getItemAsync(`${key}.n`)
  if (altRoh) {
    const alt = Number.parseInt(altRoh, 10)
    if (Number.isFinite(alt)) {
      for (let i = 0; i < alt; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => undefined)
      }
    }
    await SecureStore.deleteItemAsync(`${key}.n`).catch(() => undefined)
  }
  await SecureStore.deleteItemAsync(key).catch(() => undefined)

  const teile: string[] = []
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    teile.push(value.slice(i, i + CHUNK_SIZE))
  }
  await SecureStore.setItemAsync(`${key}.n`, String(teile.length))
  for (let i = 0; i < teile.length; i++) {
    await SecureStore.setItemAsync(`${key}.${i}`, teile[i])
  }
}

async function secureRemoveItem(key: string): Promise<void> {
  const anzahlRoh = await SecureStore.getItemAsync(`${key}.n`)
  if (anzahlRoh) {
    const anzahl = Number.parseInt(anzahlRoh, 10)
    if (Number.isFinite(anzahl)) {
      for (let i = 0; i < anzahl; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => undefined)
      }
    }
    await SecureStore.deleteItemAsync(`${key}.n`).catch(() => undefined)
  }
  await SecureStore.deleteItemAsync(key).catch(() => undefined)
  // Alte AsyncStorage-Sitzungen mit entfernen (Migration / Offline-Logout).
  await AsyncStorage.removeItem(key)
}

const nativeSecureStorage: SupportedStorage = {
  getItem: secureGetItem,
  setItem: secureSetItem,
  removeItem: secureRemoveItem,
}

function waehleStorage(): SupportedStorage {
  if (istWebSSR) return noopStorage
  if (istNative) return nativeSecureStorage
  return AsyncStorage
}

// Schlüssel, unter dem supabase-js die Sitzung ablegt. Bewusst explizit gesetzt
// statt sich auf die Ableitung der Bibliothek zu verlassen: Der Offline-Fallback
// beim Abmelden (lib/auth.ts) muss genau diesen Eintrag entfernen können.
// Die Formel ist identisch zur Bibliotheks-Vorgabe (`sb-<ref>-auth-token`) —
// bestehende Sitzungen bleiben dadurch gültig.
export const SUPABASE_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

/** Entfernt die gespeicherte Sitzung aus dem Auth-Storage (auch offline). */
export async function loescheSitzungsStorage(): Promise<void> {
  await waehleStorage().removeItem(SUPABASE_STORAGE_KEY)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: waehleStorage(),
    storageKey: SUPABASE_STORAGE_KEY,
    autoRefreshToken: !istWebSSR,
    persistSession: !istWebSSR,
    detectSessionInUrl: false,
  },
})
