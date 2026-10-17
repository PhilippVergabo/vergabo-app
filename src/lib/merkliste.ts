// Merkliste des eigenen Betriebs — über die Web-Route /api/merkliste
// (Bearer). Die Tabelle hat keine Rechte für die App; Regeln und Begründung
// stehen im Web-Repo (lib/merkliste.ts). 48 h vor Fristende erinnert der
// Cron per Push und Mail, solange kein Angebot vorliegt.
import { authedFetch } from '@/lib/authedFetch'

export type GemerkterAuftrag = {
  auftrag_id: string
  erstellt_am: string
  auftraege: {
    id: string
    titel: string
    status: string
    angebotsfrist: string | null
    gewerk: string | null
    ausfuehrungsort_ort: string | null
    ausfuehrungsort_plz: string | null
  } | null
}

/** true/false — oder null, wenn die Merkliste für dieses Konto nicht gilt (z. B. Vergabestelle). */
export async function istGemerkt(auftragId: string): Promise<boolean | null> {
  try {
    const res = await authedFetch(`/api/merkliste?auftrag_id=${auftragId}`)
    if (!res.ok) return null
    const inhalt = (await res.json()) as { gemerkt?: boolean }
    return !!inhalt.gemerkt
  } catch {
    return null
  }
}

/** Merken bzw. entfernen. Gibt den neuen Zustand zurück oder eine Fehlermeldung. */
export async function setzeGemerkt(
  auftragId: string,
  gemerkt: boolean,
): Promise<{ ok: true; gemerkt: boolean } | { ok: false; fehler: string }> {
  try {
    const res = gemerkt
      ? await authedFetch('/api/merkliste', { method: 'POST', body: JSON.stringify({ auftrag_id: auftragId }) })
      : await authedFetch(`/api/merkliste?auftrag_id=${auftragId}`, { method: 'DELETE' })
    if (!res.ok) {
      const inhalt = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, fehler: inhalt.error ?? 'Das hat nicht geklappt. Bitte erneut versuchen.' }
    }
    return { ok: true, gemerkt }
  } catch {
    return { ok: false, fehler: 'Keine Verbindung. Bitte prüfen Sie Ihre Internetverbindung.' }
  }
}

/** Alle gemerkten Ausschreibungen des Betriebs, neueste zuerst. */
export async function ladeMerkliste(): Promise<GemerkterAuftrag[]> {
  try {
    const res = await authedFetch('/api/merkliste')
    if (!res.ok) return []
    const inhalt = (await res.json()) as { eintraege?: GemerkterAuftrag[] }
    return Array.isArray(inhalt.eintraege) ? inhalt.eintraege : []
  } catch {
    return []
  }
}
