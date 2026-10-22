/**
 * Entwurf eines Angebots auf dem Gerät.
 *
 * Tester-Meldung (21.10.2026, im Web): Wer im Angebotsformular zum Profil
 * wechselte, um einen Nachweis hochzuladen, kam auf ein leeres Formular zurück
 * und tippte alles noch einmal. In der App ist das noch leichter zu verlieren
 * als im Browser — ein Anruf, ein Sperrbildschirm, iOS entlädt die App, und
 * die halbe Kalkulation ist weg. Seither schreibt das Formular jede Eingabe
 * **automatisch** in den Gerätespeicher — kein Knopf, kein „Speichern" — und
 * stellt sie beim nächsten Öffnen wieder her. Nach dem Einreichen ist der
 * Entwurf weg.
 *
 * ⚠️ Unterschied zum Web (`lib/angebotsEntwurf.ts`): Dort lassen sich die
 * ausgewählten **Dateien** nicht sichern, der Browser gibt ein `File` nach dem
 * Verlassen der Seite nicht mehr her — gespeichert werden nur die Dateinamen,
 * damit der Hinweis sagen kann, was erneut zu wählen ist. Hier geht mehr: der
 * Dokument-Picker legt eine Kopie im Cache ab, und wir kopieren sie in einen
 * eigenen Ordner unter `Paths.document` (den räumt iOS nicht ab). Deshalb
 * stehen in `nachweisDateien`/`anhaenge` vollständige Dateien samt `uri` —
 * nach dem Wiederherstellen prüfen wir, ob die Kopie noch existiert.
 *
 * Der Entwurf gehört zu EINEM Auftrag und EINEM Betrieb (Schlüssel). Ein
 * Kollege, der sich auf demselben Gerät anmeldet, sieht ihn nicht; derselbe
 * Betrieb auf einem anderen Gerät auch nicht — es ist ein Komfort, keine
 * Synchronisation.
 *
 * Alles hier ist rein und ohne Gerät testbar; nur `lese…`/`schreibe…`/
 * `loesche…`/`sichere…` fassen AsyncStorage bzw. das Dateisystem an, jeweils
 * in try/catch (voller Speicher, fehlendes Natives Modul → so tun, als gäbe es
 * keinen Entwurf; ein Angebot abgeben muss auch dann gehen).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  validiereDatei,
  type LvPreis,
  type PickedFile,
  type Position,
} from '@/lib/bewerbung'

export const ENTWURF_VERSION = 1
/** Ältere Entwürfe werden verworfen – die Angebotsfrist ist dann längst um. */
export const ENTWURF_MAX_ALTER_TAGE = 30

/** Präfix aller Entwurfs-Schlüssel — auch für das Aufräumen alter Entwürfe. */
export const ENTWURF_PREFIX = 'vergabo:angebot-entwurf:'

/** Unterordner in `Paths.document`, in dem die Datei-Kopien liegen. */
const DATEI_ORDNER = 'angebot-entwuerfe'

export type AngebotsEntwurf = {
  version: number
  /** ISO-Zeitpunkt des letzten Speicherns. */
  gespeichertAm: string
  angebotsnummer: string
  formData: { ausfuehrungszeitraum: string; beschreibung: string; referenzen: string }
  positionen: Position[]
  lvPreise: LvPreis[]
  eignungsbestaetigung: Record<string, boolean>
  verpflichtungenBestaetigt: boolean[]
  /** Nachweis-Dateien je Kriterium-ID (uri zeigt auf die gesicherte Kopie). */
  nachweisDateien: Record<string, PickedFile>
  anhaenge: PickedFile[]
}

export function entwurfSchluessel(auftragId: string, anbieterId: string): string {
  return `${ENTWURF_PREFIX}${auftragId}:${anbieterId}`
}

/**
 * Hat der Bieter etwas eingegeben, das es zu bewahren lohnt?
 *
 * Vorbelegungen zählen nicht: Der Ausführungszeitraum kommt vom Auftraggeber,
 * die Angebotsnummer wird vorgeschlagen, Häkchen setzt das Profil automatisch.
 * Sonst stünde beim ersten Öffnen schon „Entwurf wiederhergestellt", ohne dass
 * jemand etwas getan hätte. Eine ausgewählte Datei zählt hier dagegen schon —
 * anders als im Web, wo sie nicht gesichert werden kann.
 */
export function istEntwurfLeer(
  e: Pick<
    AngebotsEntwurf,
    'formData' | 'positionen' | 'lvPreise' | 'verpflichtungenBestaetigt' | 'nachweisDateien' | 'anhaenge'
  >,
  vorbelegterZeitraum: string | null,
): boolean {
  if (e.formData.beschreibung.trim() || e.formData.referenzen.trim()) return false
  const zeitraum = e.formData.ausfuehrungszeitraum.trim()
  if (zeitraum && zeitraum !== (vorbelegterZeitraum ?? '')) return false
  if (e.positionen.some((p) => Number(p.einzelpreis) > 0 || Number(p.gesamt) > 0)) return false
  if (e.lvPreise.some((p) => p.einheitspreis > 0)) return false
  if (e.verpflichtungenBestaetigt.some(Boolean)) return false
  if (Object.keys(e.nachweisDateien).length > 0) return false
  if (e.anhaenge.length > 0) return false
  return true
}

/** Angebotssumme aus dem Entwurf – die Editoren melden sie nur bei Eingaben. */
export function entwurfSumme(e: Pick<AngebotsEntwurf, 'positionen' | 'lvPreise'>): number {
  const pos = e.positionen.reduce((s, p) => s + (Number(p.gesamt) || 0), 0)
  const lv = e.lvPreise.reduce((s, p) => s + (Number(p.gesamtpreis) || 0), 0)
  return Math.round((pos + lv) * 100) / 100
}

/** Zeitpunkt für den Hinweis „Ihr Entwurf vom … wurde wiederhergestellt". */
export function entwurfZeitText(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Prüfung gelesener Werte ─────────────────────────────────────────────────
// Ein Entwurf kommt aus dem Gerätespeicher und wird behandelt wie eine
// Eingabe: Zahlen werden geklemmt (nie negativ — sonst ließe sich die
// Angebotssumme über einen manipulierten Entwurf drücken, genau wie es die
// Editoren beim Tippen verhindern), Dateien gegen dieselbe Allowlist geprüft
// wie bei der Auswahl.

function zahl(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function alsPosition(roh: unknown): Position | null {
  if (!roh || typeof roh !== 'object') return null
  const p = roh as Partial<Position>
  if (typeof p.id !== 'string' || p.id === '') return null
  const menge = zahl(p.menge)
  const einzelpreis = zahl(p.einzelpreis)
  return {
    id: p.id,
    beschreibung: typeof p.beschreibung === 'string' ? p.beschreibung : '',
    menge,
    einheit: typeof p.einheit === 'string' && p.einheit ? p.einheit : 'Stück',
    einzelpreis,
    // Nicht aus dem Entwurf übernehmen, sondern nachrechnen: ein verdrehtes
    // `gesamt` würde sonst direkt in die Angebotssumme wandern.
    gesamt: Math.round(menge * einzelpreis * 100) / 100,
  }
}

function alsLvPreis(roh: unknown): LvPreis | null {
  if (!roh || typeof roh !== 'object') return null
  const p = roh as Partial<LvPreis>
  if (typeof p.id !== 'string' || p.id === '') return null
  // Gesamtpreis bleibt wie gespeichert (Menge steckt im LV, nicht im Entwurf),
  // aber ebenfalls geklemmt.
  return { id: p.id, einheitspreis: zahl(p.einheitspreis), gesamtpreis: zahl(p.gesamtpreis) }
}

function alsDatei(roh: unknown): PickedFile | null {
  if (!roh || typeof roh !== 'object') return null
  const f = roh as Partial<PickedFile>
  if (typeof f.uri !== 'string' || !f.uri) return null
  if (typeof f.name !== 'string' || !f.name) return null
  const size = typeof f.size === 'number' && Number.isFinite(f.size) ? f.size : 0
  if (!validiereDatei({ name: f.name, size }).ok) return null
  return { uri: f.uri, name: f.name, size, mimeType: typeof f.mimeType === 'string' ? f.mimeType : undefined }
}

/** Prüft, ob ein gelesener Wert ein brauchbarer Entwurf dieser Version ist. */
export function alsEntwurf(roh: unknown, jetzt: Date = new Date()): AngebotsEntwurf | null {
  if (!roh || typeof roh !== 'object') return null
  const r = roh as Partial<AngebotsEntwurf>
  if (r.version !== ENTWURF_VERSION) return null
  if (typeof r.gespeichertAm !== 'string') return null
  const alter = jetzt.getTime() - Date.parse(r.gespeichertAm)
  if (!Number.isFinite(alter) || alter < 0 || alter > ENTWURF_MAX_ALTER_TAGE * 86400000) return null
  const f = r.formData
  if (!f || typeof f !== 'object') return null

  const nachweisDateien: Record<string, PickedFile> = {}
  if (r.nachweisDateien && typeof r.nachweisDateien === 'object') {
    for (const [kriteriumId, wert] of Object.entries(r.nachweisDateien)) {
      const datei = alsDatei(wert)
      if (datei) nachweisDateien[kriteriumId] = datei
    }
  }

  return {
    version: ENTWURF_VERSION,
    gespeichertAm: r.gespeichertAm,
    angebotsnummer: typeof r.angebotsnummer === 'string' ? r.angebotsnummer : '',
    formData: {
      ausfuehrungszeitraum: typeof f.ausfuehrungszeitraum === 'string' ? f.ausfuehrungszeitraum : '',
      beschreibung: typeof f.beschreibung === 'string' ? f.beschreibung : '',
      referenzen: typeof f.referenzen === 'string' ? f.referenzen : '',
    },
    positionen: Array.isArray(r.positionen)
      ? r.positionen.map(alsPosition).filter((p): p is Position => p !== null)
      : [],
    lvPreise: Array.isArray(r.lvPreise)
      ? r.lvPreise.map(alsLvPreis).filter((p): p is LvPreis => p !== null)
      : [],
    eignungsbestaetigung:
      r.eignungsbestaetigung && typeof r.eignungsbestaetigung === 'object'
        ? Object.fromEntries(
            Object.entries(r.eignungsbestaetigung).map(([k, v]) => [k, Boolean(v)]),
          )
        : {},
    verpflichtungenBestaetigt: Array.isArray(r.verpflichtungenBestaetigt)
      ? r.verpflichtungenBestaetigt.map(Boolean)
      : [],
    nachweisDateien,
    anhaenge: Array.isArray(r.anhaenge)
      ? r.anhaenge.map(alsDatei).filter((d): d is PickedFile => d !== null)
      : [],
  }
}

// ── Dateien sichern ─────────────────────────────────────────────────────────
// Der Dokument-Picker legt seine Kopie in den Cache (`copyToCacheDirectory`).
// Den räumt iOS bei Platzmangel ab — für einen Entwurf, der eine Nacht
// überleben soll, ist das zu wenig. Deshalb kopieren wir die Datei in einen
// eigenen Ordner unter `Paths.document`, einen je Entwurf.

type FsModul = typeof import('expo-file-system')

/**
 * expo-file-system ist ein NATIVES Modul. Lazy require wie beim Angebots-PDF
 * (src/app/auftraege/[id]/index.tsx): Ein statischer Import würde in einem
 * Dev-Build ohne das Modul schon beim Laden der Route krachen. Fehlt es, gibt
 * es eben keine gesicherten Dateien — das Formular funktioniert weiter.
 */
function fsModul(): FsModul | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-file-system') as FsModul
  } catch {
    return null
  }
}

/** Kurzer, stabiler Hash (djb2) — als Ordner-/Dateiname statt des Schlüssels. */
function kurzHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function sichererName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(-60)
}

function ordner(F: FsModul, schluessel: string) {
  return new F.Directory(F.Paths.document, DATEI_ORDNER, kurzHash(schluessel))
}

/**
 * Kopiert eine ausgewählte Datei in den Entwurfsordner und gibt sie mit der
 * neuen `uri` zurück. Mehrfach aufrufbar: liegt die Datei schon im Ordner oder
 * ist die Kopie schon da, wird nichts kopiert. Scheitert es, kommt die Datei
 * unverändert zurück — dann steht im Entwurf die Cache-uri, die den Neustart
 * vielleicht nicht übersteht; das ist besser als kein Entwurf.
 */
export function sichereDatei(schluessel: string, datei: PickedFile): PickedFile {
  const F = fsModul()
  if (!F) return datei
  try {
    const ziel = ordner(F, schluessel)
    if (datei.uri.startsWith(ziel.uri)) return datei
    if (!ziel.exists) ziel.create({ intermediates: true, idempotent: true })
    const kopie = new F.File(ziel, `${kurzHash(datei.uri)}-${sichererName(datei.name)}`)
    if (!kopie.exists) new F.File(datei.uri).copy(kopie)
    return { ...datei, uri: kopie.uri }
  } catch {
    return datei
  }
}

/**
 * Existiert die Datei noch?
 *
 * Fehlt das native Modul, gilt die Datei als nicht vorhanden: Dann lieber
 * einmal zu viel erneut auswählen lassen, als beim Einreichen an einer Datei
 * zu scheitern, die es nicht mehr gibt.
 */
export function dateiVorhanden(datei: PickedFile): boolean {
  const F = fsModul()
  if (!F) return false
  try {
    return new F.File(datei.uri).exists
  } catch {
    return false
  }
}

/** Entfernt alle gesicherten Dateien eines Entwurfs. */
export function loescheEntwurfsDateien(schluessel: string): void {
  const F = fsModul()
  if (!F) return
  try {
    const ziel = ordner(F, schluessel)
    if (ziel.exists) ziel.delete()
  } catch {
    // Ordner bleibt liegen — beim nächsten Aufräumen wird es wieder versucht.
  }
}

// ── Speicher ────────────────────────────────────────────────────────────────

/**
 * Entwurf lesen. Ein unbrauchbarer oder zu alter Entwurf wird dabei gleich
 * samt Dateien entfernt, damit er nicht für immer Platz belegt.
 */
export async function leseEntwurf(
  schluessel: string,
  jetzt: Date = new Date(),
): Promise<AngebotsEntwurf | null> {
  let roh: string | null = null
  try {
    roh = await AsyncStorage.getItem(schluessel)
  } catch {
    return null
  }
  if (!roh) return null
  let entwurf: AngebotsEntwurf | null = null
  try {
    entwurf = alsEntwurf(JSON.parse(roh), jetzt)
  } catch {
    entwurf = null
  }
  if (!entwurf) {
    await loescheEntwurf(schluessel)
    return null
  }
  return entwurf
}

export async function schreibeEntwurf(schluessel: string, e: AngebotsEntwurf): Promise<void> {
  try {
    await AsyncStorage.setItem(schluessel, JSON.stringify(e))
  } catch {
    // Voller oder gesperrter Speicher – dann eben kein Entwurf.
  }
}

/** Entwurf und seine Dateien entfernen. */
export async function loescheEntwurf(schluessel: string): Promise<void> {
  loescheEntwurfsDateien(schluessel)
  try {
    await AsyncStorage.removeItem(schluessel)
  } catch {
    // s. o.
  }
}

/**
 * Alte Entwürfe aufräumen.
 *
 * Ein Entwurf, der nie wieder geöffnet wird (Frist verpasst, Angebot im
 * Browser abgegeben), würde sonst mit seinen Dateien für immer liegen bleiben.
 * `leseEntwurf` räumt nur den Entwurf auf, den man gerade öffnet — deshalb beim
 * Öffnen des Formulars einmal über alle gehen.
 */
export async function raeumeAlteEntwuerfe(jetzt: Date = new Date()): Promise<void> {
  try {
    const schluessel = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(ENTWURF_PREFIX))
    for (const k of schluessel) {
      // leseEntwurf löscht den Eintrag selbst, wenn er zu alt oder unbrauchbar ist.
      await leseEntwurf(k, jetzt)
    }
  } catch {
    // Aufräumen ist Kür — ein Fehler darf das Formular nicht aufhalten.
  }
}
