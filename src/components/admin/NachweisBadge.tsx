import { StyleSheet, Text } from 'react-native'
import { C } from '@/lib/theme'

// Hochgeladene Nachweise/Eigenerklärungen eines Anbieters (Admin-Sicht).
// url = kurzlebige Signed-URL zum Öffnen der Datei (null = keine Datei).
export type AdminDokument = {
  id: string
  typ: string
  dateiname: string | null
  bestaetigt: boolean | null
  admin_verifiziert: boolean | null
  admin_abgelehnt: boolean | null
  url: string | null
}

/**
 * Wartet dieser Nachweis auf eine Admin-Entscheidung („⏳ in Prüfung")?
 *
 * Genau die Bedingung, unter der NachweisBadge unten in den letzten Zweig
 * fällt — hier ausgelagert, damit die Zählung am Karten-Kopf und das Badge in
 * der Liste nicht auseinanderlaufen können.
 *
 * „fehlt" (weder bestätigt noch Datei hinterlegt) zählt bewusst NICHT: daran
 * gibt es für den Admin nichts zu entscheiden, der Anbieter muss erst liefern.
 */
export function istOffenerNachweis(d: AdminDokument): boolean {
  if (!d.bestaetigt && !d.dateiname) return false
  return !d.admin_verifiziert && !d.admin_abgelehnt
}

/** Anzahl der auf eine Entscheidung wartenden Nachweise. */
export function zaehleOffeneNachweise(dokumente: AdminDokument[]): number {
  return dokumente.filter(istOffenerNachweis).length
}

// Status-Logik wie StatusBadge in eigenerklarungen.tsx (Anbieter-Sicht),
// damit Admin und Anbieter denselben Zustand sehen.
export function NachweisBadge({ d }: { d: AdminDokument }) {
  if (!d.bestaetigt && !d.dateiname) {
    return <Text style={[styles.dokBadge, styles.dokBadgeFehlt]}>fehlt</Text>
  }
  if (d.admin_verifiziert) {
    return <Text style={[styles.dokBadge, styles.dokBadgeOk]}>✓ freigegeben</Text>
  }
  if (d.admin_abgelehnt) {
    return <Text style={[styles.dokBadge, styles.dokBadgeAbgelehnt]}>✕ abgelehnt</Text>
  }
  return <Text style={[styles.dokBadge, styles.dokBadgeWartet]}>⏳ in Prüfung</Text>
}

const styles = StyleSheet.create({
  dokBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dokBadgeFehlt: { backgroundColor: C.card, color: C.muted },
  dokBadgeOk: { backgroundColor: C.ok, color: C.primary },
  dokBadgeWartet: { backgroundColor: C.warn, color: C.accent },
  dokBadgeAbgelehnt: { backgroundColor: '#f7e3df', color: '#7a3320' },
})
