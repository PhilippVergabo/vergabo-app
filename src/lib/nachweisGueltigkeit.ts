// Spiegel von vergabo/lib/nachweisGueltigkeit.ts (Web) — Gültigkeit
// hinterlegter Nachweise (`eigenerklarungen.gueltig_bis`).
//
// Hier gelandet, weil der Cron eine Push-Nachricht verschickt ("📄 Nachweis
// läuft bald ab – bitte aktualisieren Sie ihn"). Bis 11.09.2026 las die App
// `gueltig_bis` gar nicht: Der Betrieb bekam die Push, öffnete die App und
// fand nirgends, WELCHER Nachweis gemeint war.
//
// ⚠️ Bewusst folgenlos — wie im Web. Ein abgelaufener Nachweis entzieht die
// Verifizierung NICHT und sperrt kein Angebot; er wird nur sichtbar gemacht.
// Ob aus dem Ablauf eine Eignungsfolge werden darf, steht auf der Anwaltsliste.

/** Ab wie vielen Tagen vor Ablauf gewarnt (und erinnert) wird. */
export const ABLAUF_WARNUNG_TAGE = 30

export type GueltigkeitsStatus = 'ohne_datum' | 'gueltig' | 'laeuft_ab' | 'abgelaufen'

/**
 * Kalendertage von `heute` bis `gueltigBis` – negativ, wenn abgelaufen.
 *
 * Beide Werte werden als UTC-Mitternacht gelesen, damit die Differenz nicht an
 * einer Sommerzeit-Umstellung um einen Tag danebenliegt.
 */
export function tageBisAblauf(gueltigBis: string | null | undefined, heute: string): number | null {
  if (!gueltigBis) return null
  const ziel = Date.parse(`${gueltigBis.slice(0, 10)}T00:00:00Z`)
  const start = Date.parse(`${heute.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(ziel) || Number.isNaN(start)) return null
  return Math.round((ziel - start) / 86400000)
}

export function gueltigkeitsStatus(
  gueltigBis: string | null | undefined,
  heute: string,
): GueltigkeitsStatus {
  const tage = tageBisAblauf(gueltigBis, heute)
  if (tage === null) return 'ohne_datum'
  if (tage < 0) return 'abgelaufen'
  if (tage <= ABLAUF_WARNUNG_TAGE) return 'laeuft_ab'
  return 'gueltig'
}

/**
 * Kurzer Anzeigetext zum Status – `null`, wenn es nichts zu sagen gibt.
 *
 * „Läuft heute ab" statt „läuft in 0 Tagen ab": Die Zahl 0 liest sich wie ein
 * Fehler, und der letzte Gültigkeitstag ist der Tag, an dem es zählt.
 */
export function gueltigkeitsHinweis(
  gueltigBis: string | null | undefined,
  heute: string,
): string | null {
  const status = gueltigkeitsStatus(gueltigBis, heute)
  const tage = tageBisAblauf(gueltigBis, heute)
  if (status === 'ohne_datum' || status === 'gueltig' || tage === null) return null
  if (status === 'abgelaufen') {
    const her = Math.abs(tage)
    return her === 0 ? 'Abgelaufen' : `Seit ${her} ${her === 1 ? 'Tag' : 'Tagen'} abgelaufen`
  }
  if (tage === 0) return 'Läuft heute ab'
  return `Läuft in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'} ab`
}

/**
 * Heutiges Datum in Europe/Berlin als `YYYY-MM-DD`.
 *
 * `toISOString().slice(0,10)` wäre falsch: Zwischen Mitternacht und 02:00
 * Berliner Zeit liefert UTC noch den Vortag, und ein Nachweis sähe dann einen
 * halben Tag zu lang gültig aus.
 */
export function heuteBerlin(jetzt: Date = new Date()): string {
  return jetzt.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
}

/** Datum als `TT.MM.JJJJ` – für die Anzeige neben dem Dateinamen. */
export function datumDe(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [jahr, monat, tag] = iso.slice(0, 10).split('-')
  if (!jahr || !monat || !tag) return null
  return `${tag}.${monat}.${jahr}`
}
