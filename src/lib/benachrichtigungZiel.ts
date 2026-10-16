/**
 * Übersetzt den Link einer Benachrichtigung in eine Route der App.
 *
 * Die Links werden im Web erzeugt und zeigen auf Web-Seiten
 * (`/dashboard/anbieter/eigenerklarungen`, `/dashboard/auftraggeber/<id>` …).
 * Die App hat eigene Routen und einen kleineren Funktionsumfang — ohne
 * Übersetzung tippt der Nutzer ins Leere.
 *
 * Bis hierher gab es die Regel ZWEIMAL und unterschiedlich: einen Regex in
 * benachrichtigungen.tsx und eine Whitelist in push.ts. Beide erkannten
 * `/dashboard/anbieter/eigenerklarungen` nicht — die Liste wegen eines
 * Schreibfehlers („eigenerklaerungen" mit ae), der Push-Pfad, weil er auf den
 * exakten App-Pfad prüfte. Der Nachweis-Hinweis aus dem Zuschlag-Flow war
 * dadurch auf beiden Wegen tot.
 *
 * Sicherheitseigenschaft (vorher in push.ts, bleibt erhalten): Die Funktion
 * gibt AUSSCHLIESSLICH selbst gebildete App-Routen zurück, nie den
 * übergebenen Wert. Manipulierte Notification-Daten können damit keine
 * beliebige Navigation auslösen. Unbekanntes ergibt null — dann wird die
 * Benachrichtigung nur als gelesen markiert.
 */

const AUFTRAG = /\/auftraege\/([0-9a-f-]{36})/i

export function appZiel(link: string | null | undefined): string | null {
  if (!link) return null

  let pfad = link
  try {
    pfad = decodeURIComponent(link)
  } catch {
    // ungültige Kodierung → Rohwert prüfen
  }
  pfad = pfad.split('#')[0] // Web-Anker verwerfen

  // Auftragsdetail: die einzige Route mit Parameter.
  const treffer = pfad.match(AUFTRAG)
  if (treffer) return `/auftraege/${treffer[1].toLowerCase()}`

  // Nachweise & Erklärungen. Beide Schreibweisen, weil Web und App sich hier
  // uneinig sind (`eigenerklarungen` vs. `eigenerklaerungen`).
  if (/eigenerkl[aä]e?rungen|nachweis/i.test(pfad)) return '/eigenerklarungen'

  if (/^\/admin(\/|$)/.test(pfad)) return '/admin'

  // Für diese Web-Seiten gibt es in der App keine Entsprechung: Das
  // Auftraggeber-Dashboard je Auftrag existiert hier nicht. Die Startseite
  // zeigt demselben Nutzer dieselbe Liste — besser als ein toter Tipp.
  if (/^\/dashboard(\/|$)/.test(pfad)) return '/'
  if (pfad === '/auftraege') return '/'

  return null
}

/** Kurzer Hinweis für Screenreader, passend zum Ziel. */
export function zielHinweis(ziel: string | null): string {
  if (!ziel) return 'Markiert die Benachrichtigung als gelesen'
  if (ziel.startsWith('/auftraege/')) return 'Öffnet die Ausschreibung'
  if (ziel === '/eigenerklarungen') return 'Öffnet Nachweise & Erklärungen'
  if (ziel === '/admin') return 'Öffnet den Admin-Bereich'
  return 'Öffnet die Startseite'
}
