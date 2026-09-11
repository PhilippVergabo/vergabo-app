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
//
// Behördensprache statt Eigenwortschatz — und die richtige Behördensprache
// hängt von der Leistungsart ab:
//
//   Bauleistung    VOB/A-Welt: „Freihändige Vergabe"
//   Dienstleistung UVgO-Welt:  „Verhandlungsvergabe"
//
// „Direktvergabe" stand hier bis 11.09.2026 und war ein Wort, das in keiner
// Norm vorkommt. Das Web hat es am 11.08.2026 abgeschafft (lib/verfahren.ts);
// die App zeigte es weiter — der Bieter las in der App eine andere
// Verfahrensart als auf der Webseite und im Vergabevermerk.
//
// ⚠️ NUR Anzeigetexte. Die DB-Enum-Werte (direktauftrag, direktvergabe_3,
// beschraenkte_ausschreibung) bleiben unverändert. Der Schlüssel
// `direktvergabe_3` ist historisch und sagt nichts über das Verfahren aus.
//
// Spiegelt lib/verfahren.ts im Web-Repo — Änderungen dort gehören hierher.
type LabelSatz = Record<string, string>

const LABELS_BAU: LabelSatz = {
  direktauftrag: 'Direktauftrag',
  direktvergabe_3: 'Freihändige Vergabe',
  beschraenkte_ausschreibung: 'Beschränkte Ausschreibung',
}

const LABELS_DIENST: LabelSatz = {
  direktauftrag: 'Direktauftrag',
  direktvergabe_3: 'Verhandlungsvergabe',
  beschraenkte_ausschreibung: 'Beschränkte Ausschreibung',
}

// Ohne Angabe gilt die Bauleistung — Vergabos Bestandsdaten und Kerngeschäft.
// Dieselbe Vorgabe wie alsLeistungsart() im Web.
function labelSatz(leistungsart?: string | null): LabelSatz {
  return leistungsart === 'dienstleistung' ? LABELS_DIENST : LABELS_BAU
}

// Schlüssel → Label; unbekannte Werte werden unverändert zurückgegeben.
export function verfahrenLabel(
  verfahren: string | null | undefined,
  leistungsart?: string | null,
): string {
  if (!verfahren) return ''
  return labelSatz(leistungsart)[verfahren] ?? verfahren
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
//
// Optional mit Angebotsfrist + stabilem Zeitstempel: Der DB-Status bleibt bis
// zum Zuschlag `veroeffentlicht` — nach Fristablauf ist „Veröffentlicht" für
// den Auftraggeber aber irreführend (Anbieter sehen den Auftrag nicht mehr).
// Dann: „Frist abgelaufen" in Warn-Optik (Spiegel von lib/statusLabels.ts im Web).
export function auftragStatusStil(
  status: string,
  angebotsfrist?: string | null,
  jetztMs?: number,
): AuftragStatusStil {
  if (
    status === 'veroeffentlicht' &&
    angebotsfrist &&
    jetztMs != null &&
    new Date(angebotsfrist).getTime() < jetztMs
  ) {
    return { label: 'Frist abgelaufen', bg: '#fdf3ea', fg: '#8a4a1e' }
  }
  return AUFTRAG_STATUS[status] ?? { label: status, bg: '#ece8df', fg: '#6b6b60' }
}
