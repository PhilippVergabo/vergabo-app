// Auftragsdaten, wie ein BIETER sie sehen darf — über die Web-Plattform statt
// direkt aus der Tabelle `auftraege`.
//
// Bis 21.09.2026 las die App `budget_bis` (Budgetstufe in Startliste und
// Auftragsdetail) und `kostenschaetzung` (Vorbefüllen des Angebots) direkt aus
// der Datenbank. Beides ist die interne Kalkulation der Vergabestelle:
// `budget_bis` ist meist die exakte Summe der Kostenschätzung, nicht die
// veröffentlichte Stufe, und `kostenschaetzung` trägt die erwarteten
// Einzelpreise. Das Sicherheits-Audit des Web-Repos entzieht dem Browser diese
// Spalten (docs/sicherheits-audit-migrationen.sql, Schritt 2). Mit den direkten
// Abfragen wäre die App danach tot gewesen: Ein fehlendes Spaltenrecht lässt in
// Postgres die GANZE Abfrage scheitern, nicht nur die eine Spalte.
//
// ⚠️ Keine Abfrage der App darf diese vier Spalten wieder anfordern:
//    budget_von, budget_bis, haushaltsstelle, kostenschaetzung.
//
// Beide Routen sind öffentlich (kein Token nötig) und liefern ausschließlich
// VERÖFFENTLICHTE Aufträge — die Stufe statt des Betrags, Positionen ohne Preise.
import { API_URL } from '@/lib/config'

/** Eine Position der Kostenschätzung — so viel davon, wie ein Bieter sehen darf. */
export type PositionsVorlage = {
  /** Bereits serverseitig nach der Regel `String(p.id ?? i + 1)` vergeben. */
  id: string
  beschreibung: string
  menge: number
  einheit: string
}

/** Antwort von `/api/auftrag/bieteransicht/[id]` (Web). */
export type Bieteransicht = {
  id: string
  titel: string
  beschreibung: string | null
  status: string
  angebotsfrist: string | null
  bindefrist: string | null
  ausfuehrung_von: string | null
  ausfuehrung_bis: string | null
  eignungskriterien: unknown
  verpflichtungserklaerungen: unknown
  hat_leistungsverzeichnis: boolean | null
  leistungsverzeichnis: unknown
  budgetLabel: string | null
  budgetObergrenze: number | null
  positionenVorlage: PositionsVorlage[]
}

export type BieteransichtErgebnis =
  | { art: 'ok'; auftrag: Bieteransicht }
  /** 404: Entwurf, vergeben, aufgehoben — oder die ID gibt es nicht. */
  | { art: 'nicht_veroeffentlicht' }
  /** Netz- oder Serverfehler: nichts über den Auftrag bekannt. */
  | { art: 'fehler' }

export async function ladeBieteransicht(id: string): Promise<BieteransichtErgebnis> {
  try {
    const res = await fetch(`${API_URL}/api/auftrag/bieteransicht/${encodeURIComponent(id)}`)
    if (res.status === 404) return { art: 'nicht_veroeffentlicht' }
    if (!res.ok) return { art: 'fehler' }
    const auftrag = (await res.json()) as Bieteransicht
    return {
      art: 'ok',
      auftrag: {
        ...auftrag,
        positionenVorlage: Array.isArray(auftrag.positionenVorlage) ? auftrag.positionenVorlage : [],
      },
    }
  } catch {
    return { art: 'fehler' }
  }
}

/** Obergrenze der Web-Route je Anfrage. */
const MAX_IDS_JE_ANFRAGE = 200

/**
 * Budgetstufe je Auftrag, z. B. „10.000 – 25.000 €" — nie der Betrag.
 *
 * Nicht-fatal: Scheitert die Anfrage, kommt ein leeres Objekt zurück und die
 * Karten zeigen schlicht keine Stufe. Ein fehlender Eintrag heißt: nicht
 * veröffentlicht oder unbekannt; `null` heißt: veröffentlicht, aber ohne Budget.
 */
export async function ladeBudgetstufen(ids: string[]): Promise<Record<string, string | null>> {
  const eindeutig = [...new Set(ids)]
  if (eindeutig.length === 0) return {}

  const pakete: string[][] = []
  for (let i = 0; i < eindeutig.length; i += MAX_IDS_JE_ANFRAGE) {
    pakete.push(eindeutig.slice(i, i + MAX_IDS_JE_ANFRAGE))
  }

  const ergebnisse = await Promise.all(
    pakete.map(async (paket) => {
      try {
        const res = await fetch(`${API_URL}/api/auftrag/budgetstufen?ids=${paket.join(',')}`)
        if (!res.ok) return {}
        const daten = (await res.json()) as { stufen?: Record<string, string | null> }
        return daten.stufen ?? {}
      } catch {
        return {}
      }
    }),
  )
  return Object.assign({}, ...ergebnisse) as Record<string, string | null>
}
