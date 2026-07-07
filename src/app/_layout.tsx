import { useEffect, useState } from 'react'
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const router = useRouter()
  const segments = useSegments()
  const navigationState = useRootNavigationState()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return

    SplashScreen.hideAsync()

    // Erst navigieren, wenn der Root-Navigator bereit ist — sonst korrumpiert
    // ein zu früher router.replace den Stack (toter Zurück-Button).
    if (!navigationState?.key) return

    // Öffentliche Routen (ohne Login erreichbar): Onboarding, Login, Passwort-
    // vergessen, Registrierung (registrieren-auswahl / registrieren-auftraggeber
    // via startsWith).
    const ersterSegment = segments[0] ?? ''
    const oeffentlich =
      ersterSegment === 'onboarding' ||
      ersterSegment === 'login' ||
      ersterSegment === 'passwort-vergessen' ||
      ersterSegment.startsWith('registrieren')

    if (!session && !oeffentlich) {
      // Erststart → Onboarding (leitet selbst zum Login weiter, falls bereits gesehen)
      router.replace('/onboarding')
    } else if (session && oeffentlich) {
      router.replace('/')
    }
  }, [session, segments, router, navigationState?.key])

  return (
    <>
      {/* Dunkle Status-Bar-Icons (Uhrzeit/Akku/Signal) — sichtbar auf hellem Hintergrund */}
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen
        name="passwort-vergessen"
        options={{ title: 'Passwort vergessen', headerBackTitle: 'Zurück', headerTintColor: '#3a5a3e' }}
      />
      <Stack.Screen name="registrieren-auswahl" options={{ headerShown: false }} />
      <Stack.Screen name="registrieren" options={{ headerShown: false }} />
      <Stack.Screen name="registrieren-auftraggeber" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="admin"
        options={{ title: 'Anbieter verifizieren', headerBackTitle: 'Zurück', headerTintColor: '#3a5a3e' }}
      />
      <Stack.Screen
        name="einstellungen"
        options={{ title: 'Einstellungen', headerBackTitle: 'Zurück', headerTintColor: '#3a5a3e' }}
      />
      <Stack.Screen
        name="eigenerklarungen"
        options={{ title: 'Nachweise & Erklärungen', headerBackTitle: 'Zurück', headerTintColor: '#3a5a3e' }}
      />
      <Stack.Screen
        name="benachrichtigungen"
        options={{ title: 'Benachrichtigungen', headerBackTitle: 'Zurück', headerTintColor: '#3a5a3e' }}
      />
      <Stack.Screen
        name="auftraege/[id]/index"
        options={{ title: 'Ausschreibung', headerBackTitle: 'Zurück', headerTintColor: '#3a5a3e' }}
      />
      <Stack.Screen
        name="auftraege/[id]/bewerben"
        options={{ title: 'Angebot abgeben', headerBackTitle: 'Zurück', headerTintColor: '#3a5a3e' }}
      />
      <Stack.Screen
        name="auftraege/[id]/bearbeiten"
        options={{ title: 'Angebot bearbeiten', headerBackTitle: 'Zurück', headerTintColor: '#3a5a3e' }}
      />
      </Stack>
    </>
  )
}
