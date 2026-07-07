// Geteilte Anzeige-Labels für Gewerke. Vorher in AnbieterHome, AuftraggeberHome
// und admin dupliziert — und in AuftragKarte/Detail fehlten sie ganz, sodass
// dort der rohe Schlüssel ("malerarbeiten") statt des Labels angezeigt wurde.
export const GEWERK_LABELS: Record<string, string> = {
  malerarbeiten: 'Malerarbeiten',
  sanitaer: 'Sanitär',
  elektro: 'Elektro',
  schreiner: 'Schreiner',
  dachdecker: 'Dachdecker',
  garten: 'Garten',
  reinigung: 'Reinigung',
  sonstiges: 'Sonstiges',
}

// Schlüssel → Label; unbekannte Werte werden unverändert zurückgegeben.
export function gewerkLabel(gewerk: string | null | undefined): string {
  if (!gewerk) return ''
  return GEWERK_LABELS[gewerk] ?? gewerk
}

// Vergabeverfahren → Anzeige-Label (dezente Zusatzinfo in Karten/Detail).
export const VERFAHREN_LABELS: Record<string, string> = {
  direktauftrag: 'Direktauftrag',
  direktvergabe_3: 'Direktvergabe',
  beschraenkte_ausschreibung: 'Beschränkte Ausschreibung',
}

// Schlüssel → Label; unbekannte Werte werden unverändert zurückgegeben.
export function verfahrenLabel(verfahren: string | null | undefined): string {
  if (!verfahren) return ''
  return VERFAHREN_LABELS[verfahren] ?? verfahren
}

// Auftragsstatus → Anzeige-Label + Badge-Farben (Hintergrund, Text).
// Vorher lokal in AuftraggeberHome definiert.
export type AuftragStatusStil = { label: string; bg: string; fg: string }

export const AUFTRAG_STATUS: Record<string, AuftragStatusStil> = {
  entwurf: { label: 'Entwurf', bg: '#ece8df', fg: '#6b6b60' },
  veroeffentlicht: { label: 'Veröffentlicht', bg: '#e8f0e9', fg: '#3a5a3e' },
  in_pruefung: { label: 'In Prüfung', bg: '#fdf3ea', fg: '#c87941' },
  vergeben: { label: 'Vergeben', bg: '#e6eef5', fg: '#2f5d8a' },
  abgeschlossen: { label: 'Abgeschlossen', bg: '#ece8df', fg: '#6b6b60' },
  storniert: { label: 'Storniert', bg: '#f5e6e2', fg: '#9a4a35' },
}

// Status → Stil; unbekannte Status erhalten den neutralen Entwurf-Stil mit
// dem rohen Status als Label (Verhalten wie zuvor in AuftraggeberHome).
export function auftragStatusStil(status: string): AuftragStatusStil {
  return AUFTRAG_STATUS[status] ?? { label: status, bg: '#ece8df', fg: '#6b6b60' }
}
