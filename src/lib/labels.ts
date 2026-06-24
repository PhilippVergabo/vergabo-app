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
