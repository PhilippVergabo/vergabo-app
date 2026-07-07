import { useEffect, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/authedFetch'
import { abmeldenMitBestaetigung } from '@/lib/auth'
import { C } from '@/lib/theme'

// Einstellungen: Konto-Infos, Abmelden, rechtliche Links, App-Version und
// die (von Apple vorgeschriebene) Konto-Löschung direkt in der App.

const RECHTLICHE_LINKS = [
  { label: 'AGB', url: 'https://www.vergabo.de/agb' },
  { label: 'Datenschutz', url: 'https://www.vergabo.de/datenschutz' },
  { label: 'Hilfe', url: 'https://www.vergabo.de/hilfe' },
] as const

export default function EinstellungenScreen() {
  const [email, setEmail] = useState<string | null>(null)
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null)
    })
  }, [])

  async function kontoLoeschenAusfuehren() {
    setLoeschenLaeuft(true)
    try {
      const res = await authedFetch('/api/konto-loeschen', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        let meldung = 'Ihr Konto konnte nicht gelöscht werden. Bitte versuchen Sie es später erneut.'
        try {
          const json = (await res.json()) as { error?: string }
          if (json?.error) meldung = json.error
        } catch {
          // Antwort war kein JSON — generische Meldung behalten
        }
        Alert.alert('Löschung fehlgeschlagen', meldung)
        return
      }
      await supabase.auth.signOut()
      Alert.alert(
        'Konto gelöscht',
        'Ihr Konto wurde gelöscht. Daten laufender Vergaben bleiben aus rechtlichen Gründen für die Dauer der Aufbewahrungsfristen gespeichert.',
      )
    } catch {
      Alert.alert(
        'Löschung fehlgeschlagen',
        'Netzwerkfehler — bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
      )
    } finally {
      setLoeschenLaeuft(false)
    }
  }

  // Zweistufige Bestätigung: erst Erklärung, dann finale Rückfrage.
  function kontoLoeschenStarten() {
    if (loeschenLaeuft) return
    Alert.alert(
      'Konto endgültig löschen',
      'Die Löschung Ihres Kontos ist unwiderruflich. Ihre Profildaten und Ihr Zugang werden entfernt. ' +
        'Dokumentationspflichtige Daten laufender oder abgeschlossener Vergaben bleiben für die Dauer der gesetzlichen Aufbewahrungsfristen gewahrt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Weiter',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Wirklich löschen?', 'Möchten Sie Ihr Konto jetzt endgültig löschen?', [
              { text: 'Abbrechen', style: 'cancel' },
              {
                text: 'Endgültig löschen',
                style: 'destructive',
                onPress: () => void kontoLoeschenAusfuehren(),
              },
            ])
          },
        },
      ],
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Konto */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Konto</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>E-Mail</Text>
          <Text style={styles.rowValue}>{email ?? '—'}</Text>
        </View>
        <Pressable
          style={styles.abmeldenButton}
          onPress={abmeldenMitBestaetigung}
          accessibilityRole="button"
        >
          <Text style={styles.abmeldenText}>Abmelden</Text>
        </Pressable>
      </View>

      {/* Rechtliches & Hilfe */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rechtliches & Hilfe</Text>
        {RECHTLICHE_LINKS.map((link, i) => (
          <Pressable
            key={link.label}
            style={[styles.linkRow, i > 0 && styles.linkRowBorder]}
            onPress={() => void WebBrowser.openBrowserAsync(link.url)}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>{link.label}</Text>
            <Text style={styles.linkChevron}>›</Text>
          </Pressable>
        ))}
      </View>

      {/* App-Version */}
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>App-Version</Text>
          <Text style={styles.rowValue}>{Constants.expoConfig?.version ?? '—'}</Text>
        </View>
      </View>

      {/* Gefahrenzone */}
      <View style={[styles.card, styles.gefahrCard]}>
        <Text style={[styles.cardTitle, styles.gefahrTitle]}>Gefahrenzone</Text>
        <Text style={styles.gefahrHinweis}>
          Die Löschung Ihres Kontos ist unwiderruflich. Aufbewahrungsfristen laufender Vergaben
          bleiben gewahrt.
        </Text>
        <Pressable
          style={[styles.loeschenButton, loeschenLaeuft && styles.buttonDisabled]}
          onPress={kontoLoeschenStarten}
          disabled={loeschenLaeuft}
          accessibilityRole="button"
          accessibilityState={{ disabled: loeschenLaeuft, busy: loeschenLaeuft }}
        >
          <Text style={styles.loeschenText}>
            {loeschenLaeuft ? 'Wird gelöscht …' : 'Konto endgültig löschen'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontSize: 14,
    color: C.muted,
  },
  rowValue: {
    fontSize: 14,
    color: C.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  abmeldenButton: {
    borderWidth: 1,
    borderColor: C.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  abmeldenText: {
    color: C.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  linkRowBorder: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  linkText: {
    fontSize: 15,
    color: C.text,
  },
  linkChevron: {
    fontSize: 20,
    color: C.muted,
  },
  gefahrCard: {
    borderColor: '#e2b3a3',
  },
  gefahrTitle: {
    color: '#a33d2a',
  },
  gefahrHinweis: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
  },
  loeschenButton: {
    borderWidth: 1,
    borderColor: '#a33d2a',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  loeschenText: {
    color: '#a33d2a',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
