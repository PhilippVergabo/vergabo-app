import { supabase } from '@/lib/supabase'

/**
 * Wer gehört zu welchem Betrieb bzw. zu welcher Vergabestelle?
 *
 * Bis zur Mitgliedschafts-Migration galt „ein Login = ein Betrieb", und der
 * Code fragte überall `_profile.user_id = <angemeldeter Nutzer>`. Diese Spalte
 * gibt es nicht mehr: Die Zuordnung steht jetzt in `anbieter_mitglieder` bzw.
 * `auftraggeber_mitglieder`, und die RLS-Policies entscheiden darüber
 * (`meine_anbieter_ids()` / `meine_auftraggeber_ids()`).
 *
 * Das Web hat diese Umstellung mit lib/mitgliedschaft.ts mitgemacht — die App
 * nicht. Dieses Modul ist das App-Gegenstück, bewusst mit derselben Logik und
 * derselben Vorrangregel, damit beide Seiten dieselbe Organisation meinen.
 */

/**
 * Platzhalter für „diese Person gehört zu keinem Betrieb".
 *
 * Aufrufstellen filtern damit weiter in EINER Abfrage (`.eq('id', id ?? KEIN_PROFIL)`),
 * statt den Kontrollfluss umzubauen. Eine Null-UUID ist syntaktisch gültig und
 * kann keine Zeile treffen — das Ergebnis ist dasselbe wie früher bei einem
 * Nutzer ohne Profil: kein Treffer, kein Fehler. Ein leerer String wäre es
 * NICHT: den weist Postgres als ungültige UUID zurück, aus „nicht gefunden"
 * würde ein Fehler.
 */
export const KEIN_PROFIL = '00000000-0000-0000-0000-000000000000'

/**
 * Welche Organisation ist gemeint, wenn jemand zu mehreren gehört?
 *
 * Die Reihenfolge ist bewusst festgelegt und nicht dem Zufall überlassen:
 * erstens die ausdrückliche Wahl aus `profiles.aktive_organisation`, zweitens
 * (falls sie ins Leere zeigt, etwa nach dem Ausscheiden) die älteste
 * Mitgliedschaft. Eine unsortierte Abfrage lieferte sonst je nach
 * Ausführungsplan mal die eine, mal die andere Organisation — und ein Angebot
 * im falschen Betrieb ist kein Anzeigefehler.
 */
async function waehleOrganisation(userId: string, kandidaten: string[]): Promise<string | null> {
  if (kandidaten.length === 0) return null
  if (kandidaten.length === 1) return kandidaten[0]

  const { data } = await supabase
    .from('profiles')
    .select('aktive_organisation')
    .eq('id', userId)
    .maybeSingle()
  const gewaehlt = (data as { aktive_organisation?: string | null } | null)?.aktive_organisation
  if (gewaehlt && kandidaten.includes(gewaehlt)) return gewaehlt
  return kandidaten[0]
}

/** ID des Betriebs, in dem der Nutzer gerade arbeitet — oder null. */
export async function meinAnbieterId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('anbieter_mitglieder')
    .select('anbieter_id, beigetreten_am')
    .eq('user_id', userId)
    .eq('aktiv', true)
    .order('beigetreten_am', { ascending: true, nullsFirst: true })
  return waehleOrganisation(userId, (data ?? []).map((m) => m.anbieter_id as string))
}

/** ID der Vergabestelle, in der der Nutzer gerade arbeitet — oder null. */
export async function meinAuftraggeberId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('auftraggeber_mitglieder')
    .select('auftraggeber_id, beigetreten_am')
    .eq('user_id', userId)
    .eq('aktiv', true)
    .order('beigetreten_am', { ascending: true, nullsFirst: true })
  return waehleOrganisation(userId, (data ?? []).map((m) => m.auftraggeber_id as string))
}
