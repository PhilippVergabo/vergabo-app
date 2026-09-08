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
 * Entscheidend ist die DATEI. Eine Eigenerklärung ohne Datei ist eine
 * verbindliche Erklärung des Anbieters, kein zu begutachtendes Dokument —
 * daran kann ein Admin nichts entscheiden. Der Web-Admin blendet für diese
 * Fälle bewusst weder Status noch Prüf-Buttons ein
 * (app/admin/anbieter/page.tsx), und /api/app-admin/anbieter zählt sie aus
 * demselben Grund nicht mit.
 *
 * Die App wich hier ab: Sie zeigte „in Prüfung" samt Buttons auch ohne Datei.
 * Dadurch stimmte der Badge am Karten-Kopf (Server-Zählung) nicht mit der
 * aufgeklappten Liste (lokale Zählung) überein — der Hinweis erschien erst
 * NACH dem Öffnen der Nachweise. Diese Bedingung ist jetzt für Zählung, Badge
 * und Buttons dieselbe und deckt sich mit Web und Backend.
 */
export function istOffenerNachweis(d: AdminDokument): boolean {
  if (!d.dateiname) return false
  return !d.admin_verifiziert && !d.admin_abgelehnt
}

/** Anzahl der auf eine Entscheidung wartenden Nachweise. */
export function zaehleOffeneNachweise(dokumente: AdminDokument[]): number {
  return dokumente.filter(istOffenerNachweis).length
}

// Status-Logik gespiegelt aus dem Web-Admin (app/admin/anbieter/page.tsx),
// damit beide Oberflächen denselben Zustand zeigen.
export function NachweisBadge({ d }: { d: AdminDokument }) {
  // Gar nichts geliefert: Der Anbieter muss erst tätig werden. Eigener Zustand
  // statt „keine Prüfung nötig" — der Unterschied ist für den Admin sichtbar
  // relevant, für die Prüfpflicht aber ohne Folge (beides: nichts zu tun).
  if (!d.bestaetigt && !d.dateiname) {
    return <Text style={[styles.dokBadge, styles.dokBadgeFehlt]}>fehlt</Text>
  }
  if (!d.dateiname) {
    return (
      <Text style={[styles.dokBadge, styles.dokBadgeErklaerung]}>
        Eigenerklärung – keine Prüfung nötig
      </Text>
    )
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
  dokBadgeErklaerung: { backgroundColor: '#f0efe9', color: C.muted },
  dokBadgeOk: { backgroundColor: C.ok, color: C.primary },
  dokBadgeWartet: { backgroundColor: C.warn, color: C.accent },
  dokBadgeAbgelehnt: { backgroundColor: '#f7e3df', color: '#7a3320' },
})
