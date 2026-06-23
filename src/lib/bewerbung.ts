// Geteilte Typen + Validierung für die Angebotsabgabe.
// Gespiegelt aus der Web-Plattform (lib/lvTypes, lib/uploadValidation,
// components/Eignungskriterien) — bewusst 1:1, damit App und Web identische
// Datenstrukturen und Regeln verwenden.

// ── Freie Positionen (ohne Leistungsverzeichnis) ────────────────────────────
export interface Position {
  id: string
  beschreibung: string
  menge: number
  einheit: string
  einzelpreis: number
  gesamt: number
}

export const EINHEITEN = ['Stunden', 'Pauschale', 'Stück', 'm²', 'm', 'kg', 'Liter']

// ── Leistungsverzeichnis (LV) ───────────────────────────────────────────────
export interface LvPosition {
  id: string
  ordnungszahl: string
  kurztext: string
  langtext: string
  menge: number
  einheit: string
  typ: 'normal' | 'bedarf' | 'alternativ'
}

export interface LvPreis {
  id: string
  einheitspreis: number
  gesamtpreis: number
}

// ── Eignungskriterien ───────────────────────────────────────────────────────
export interface Kriterium {
  id: string
  text: string
  pflicht: boolean
  nachweis_erforderlich?: boolean
  nachweis_typ?: string | null
}

export const NACHWEIS_TYP_LABELS: Record<string, string> = {
  gewerbeanmeldung: 'Gewerbeanmeldung',
  haftpflicht: 'Haftpflichtversicherung',
  meisterbrief: 'Meister-/Befähigungsnachweis',
  unbedenklichkeit: 'Unbedenklichkeitsbescheinigung',
  referenzliste: 'Referenzliste',
  sonstiges: 'Sonstiger Nachweis',
}

// ── Upload-Validierung (Client-Vorprüfung, identisch zur Web-Allowlist) ──────
const MB = 1024 * 1024

export const BEWERBUNG_UPLOAD = {
  maxBytes: 15 * MB,
  endungen: ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'xlsx'],
  label: 'PDF, PNG, JPG, DOCX, XLSX',
}

const VERBOTENE_ENDUNGEN = new Set([
  'exe', 'bat', 'sh', 'cmd', 'com', 'msi', 'msix', 'scr', 'pif', 'jar', 'app', 'deb', 'rpm',
  'js', 'mjs', 'cjs', 'vbs', 'vbe', 'ws', 'wsf', 'ps1', 'psm1', 'py', 'rb', 'pl', 'php',
  'docm', 'xlsm', 'pptm', 'dotm', 'xltm', 'potm',
  'svg', 'svgz', 'html', 'htm', 'xhtml', 'shtml', 'mht', 'mhtml',
  'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'cab', 'iso', 'dmg',
])

export function dateiEndung(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function validiereDatei(file: { name: string; size: number }): { ok: boolean; fehler?: string } {
  const endung = dateiEndung(file.name)
  if (!endung || VERBOTENE_ENDUNGEN.has(endung) || !BEWERBUNG_UPLOAD.endungen.includes(endung)) {
    return { ok: false, fehler: `Dateityp nicht erlaubt. Erlaubt: ${BEWERBUNG_UPLOAD.label}.` }
  }
  if (file.size > BEWERBUNG_UPLOAD.maxBytes) {
    return { ok: false, fehler: `Datei zu groß, max. ${Math.round(BEWERBUNG_UPLOAD.maxBytes / MB)} MB.` }
  }
  return { ok: true }
}

// Preis-Formatierung (de-DE, 2 Nachkommastellen)
export function fmtPreis(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
