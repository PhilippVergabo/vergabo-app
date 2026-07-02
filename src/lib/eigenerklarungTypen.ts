import { dateiEndung } from '@/lib/bewerbung'

// Spiegel von vergabo/lib/eigenerklarungTypen.ts (Web) — EINE Quelle für
// Pflicht-Flag und Label, damit App und Web nicht auseinanderlaufen.
export interface ErklaerungTyp {
  id: string
  label: string
  pflicht: boolean
}

export const ERKLAERUNG_TYPEN: ErklaerungTyp[] = [
  { id: 'gewerbeanmeldung', label: 'Gewerbeanmeldung', pflicht: true },
  { id: 'haftpflicht', label: 'Haftpflichtversicherung', pflicht: true },
  { id: 'meisterbrief', label: 'Meisterbrief / Fachkundenachweis', pflicht: false },
  { id: 'handwerksrolle', label: 'Eintragung Handwerksrolle', pflicht: false },
  { id: 'unbedenklichkeit', label: 'Steuerliche Unbedenklichkeitsbescheinigung', pflicht: false },
  { id: 'sozialversicherung', label: 'Sozialversicherungsnachweis', pflicht: false },
]

/** Lesbares Label zu einer typ-id (Fallback: die id selbst). */
export function erklaerungLabel(typ: string): string {
  return ERKLAERUNG_TYPEN.find((t) => t.id === typ)?.label ?? typ
}

// ── Upload-Regeln für den Bucket "eigenerklarungen" (Spiegel der Web-Allowlist) ──
const MB = 1024 * 1024

export const EIGENERKLARUNG_UPLOAD = {
  maxBytes: 10 * MB,
  endungen: ['pdf', 'png', 'jpg', 'jpeg'],
  label: 'PDF, PNG, JPG',
}

export function validiereEigenerklarungDatei(file: {
  name: string
  size: number
}): { ok: boolean; fehler?: string } {
  const endung = dateiEndung(file.name)
  if (!endung || !EIGENERKLARUNG_UPLOAD.endungen.includes(endung)) {
    return { ok: false, fehler: `Dateityp nicht erlaubt. Erlaubt: ${EIGENERKLARUNG_UPLOAD.label}.` }
  }
  if (file.size > EIGENERKLARUNG_UPLOAD.maxBytes) {
    return {
      ok: false,
      fehler: `Datei zu groß, max. ${Math.round(EIGENERKLARUNG_UPLOAD.maxBytes / MB)} MB.`,
    }
  }
  return { ok: true }
}

/** Spiegel von vergabo/lib/uploadValidation.ts → sanitizeDateiname. */
export function sanitizeDateiname(name: string): string {
  // Pfadanteile entfernen (Traversal/Backslashes)
  let base = name.replace(/\\/g, '/').split('/').pop() ?? name
  // Nur erlaubte Zeichen
  base = base.replace(/[^a-zA-Z0-9._-]/g, '_')
  // Mehrfach-Punkte ("..") zusammenfalten, führende ._- entfernen
  base = base.replace(/\.{2,}/g, '.').replace(/^[._-]+/, '')
  if (!base) base = 'datei'
  if (base.length > 100) {
    const ext = dateiEndung(base)
    const stem = base.slice(0, 100 - (ext ? ext.length + 1 : 0)).replace(/[._-]+$/, '') || 'datei'
    base = ext ? `${stem}.${ext}` : stem.slice(0, 100)
  }
  return base
}

/** MIME-Type zur (bereits validierten) Endung – für den Storage-Upload. */
export function contentTypeFuer(name: string): string {
  const e = dateiEndung(name)
  if (e === 'pdf') return 'application/pdf'
  if (e === 'png') return 'image/png'
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}
