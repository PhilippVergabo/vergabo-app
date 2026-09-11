import { dateiEndung } from '@/lib/bewerbung'

// Spiegel von vergabo/lib/eigenerklarungTypen.ts (Web) — EINE Quelle für
// Pflicht-Flag und Label, damit App und Web nicht auseinanderlaufen.
export interface ErklaerungTyp {
  id: string
  label: string
  pflicht: boolean
  /**
   * Gibt es zu diesem Punkt überhaupt ein Dokument?
   *
   * `false` heißt: eine reine Erklärung. Für „ich zahle Mindestlohn" stellt
   * keine Behörde eine Urkunde aus – ein Upload-Feld daneben wäre eine
   * Aufforderung, die niemand erfüllen kann.
   */
  belegbar: boolean
  /**
   * Wortlaut, den der Betrieb mit dem Häkchen bestätigt.
   *
   * Nur bei reinen Erklärungen gesetzt – und dort zwingend: Eine Zustimmung
   * ohne Text ist keine Erklärung, sondern ein Häkchen.
   */
  erklaerungstext?: string
}

export const ERKLAERUNG_TYPEN: ErklaerungTyp[] = [
  { id: 'gewerbeanmeldung', label: 'Gewerbeanmeldung', pflicht: true, belegbar: true },
  { id: 'haftpflicht', label: 'Haftpflichtversicherung', pflicht: true, belegbar: true },
  { id: 'meisterbrief', label: 'Meisterbrief / Fachkundenachweis', pflicht: false, belegbar: true },
  { id: 'handwerksrolle', label: 'Eintragung Handwerksrolle', pflicht: false, belegbar: true },
  { id: 'unbedenklichkeit', label: 'Steuerliche Unbedenklichkeitsbescheinigung', pflicht: false, belegbar: true },
  { id: 'sozialversicherung', label: 'Sozialversicherungsnachweis', pflicht: false, belegbar: true },
  {
    id: 'mindestlohn',
    label: 'Mindestlohn und keine Schwarzarbeit',
    // Bewusst freiwillig — wie im Web. Verbindlich wird die Zusage dort, wo sie
    // hingehört: in den Vergabebedingungen des einzelnen Auftrags. Eine Pflicht
    // im Profil machte alle registrierten Betriebe rückwirkend unvollständig
    // und liesse /api/zuschlag/belege-pruefen ein Dokument nachfordern, das es
    // zu dieser Erklärung nicht gibt.
    pflicht: false,
    belegbar: false,
    // Kein Paragraf im Text: Die Fundstellen für Mindestlohn- und
    // Schwarzarbeitsrecht liegen ausserhalb von UVgO und VOB/A und sind nicht
    // am Volltext geprüft. Inhaltlich richtig, Fundstelle offen.
    erklaerungstext:
      'Ich erkläre, dass ich meinen Beschäftigten bei der Ausführung öffentlicher Aufträge '
      + 'mindestens den gesetzlich vorgeschriebenen Mindestlohn zahle, dass ich meine Melde-, '
      + 'Beitrags- und Steuerpflichten ordnungsgemäß erfülle und dass ich keine Schwarzarbeit '
      + 'einsetze. Schreibt das Vergabegesetz meines Bundeslandes ein höheres Mindestentgelt '
      + 'vor, halte ich dieses ein. Dasselbe verlange ich von Nachunternehmern, die ich für '
      + 'die Ausführung einsetze.',
  },
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
