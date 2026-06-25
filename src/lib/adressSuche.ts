// Adress-Autocomplete über die Photon-API (https://photon.komoot.io) — 1:1 aus
// dem Web portiert. Kostenlos, ohne API-Key, DSGVO-freundlich (Komoot GmbH, EU,
// OpenStreetMap-Daten). Liefert strukturierte Adressen inkl. Koordinaten.

const PHOTON_URL = 'https://photon.komoot.io/api/'
// Grobe Bounding-Box Deutschland (minLon, minLat, maxLon, maxLat).
const DE_BBOX = '5.87,47.27,15.04,55.06'

// Bundesland-Name (z. B. aus openPLZ/Photon) → amtliches Kürzel. Auch von den
// Registrierungs-Screens genutzt (PLZ-Lookup), daher exportiert.
export const BUNDESLAND_KUERZEL: Record<string, string> = {
  'Baden-Württemberg': 'bw',
  Bayern: 'by',
  Berlin: 'be',
  Brandenburg: 'bb',
  Bremen: 'hb',
  Hamburg: 'hh',
  Hessen: 'he',
  'Mecklenburg-Vorpommern': 'mv',
  Niedersachsen: 'ni',
  'Nordrhein-Westfalen': 'nw',
  'Rheinland-Pfalz': 'rp',
  Saarland: 'sl',
  Sachsen: 'sn',
  'Sachsen-Anhalt': 'st',
  'Schleswig-Holstein': 'sh',
  Thüringen: 'th',
}

export function bundeslandKuerzel(name?: string | null): string {
  return (name && BUNDESLAND_KUERZEL[name]) || ''
}

export type AdressVorschlag = {
  id: string
  label: string
  strasse: string
  hausnummer: string
  strasseKomplett: string
  plz: string
  ort: string
  bundesland: string
  lat: number | null
  lon: number | null
}

type PhotonFeature = {
  properties?: {
    osm_type?: string
    osm_id?: number | string
    name?: string
    street?: string
    housenumber?: string
    postcode?: string
    city?: string
    district?: string
    state?: string
    countrycode?: string
  }
  geometry?: { coordinates?: [number, number] }
}

export function featureZuVorschlag(feature: PhotonFeature): AdressVorschlag | null {
  const p = feature?.properties ?? {}

  const strasse = p.street ?? p.name ?? ''
  const hausnummer = p.housenumber ?? ''
  const strasseKomplett = strasse && hausnummer ? `${strasse} ${hausnummer}` : strasse
  const plz = p.postcode ?? ''
  const ort = p.city ?? p.district ?? ''

  if (!strasse && !ort) return null

  const ortZeile = [plz, ort].filter(Boolean).join(' ')
  const label = [strasseKomplett, ortZeile].filter(Boolean).join(', ')

  const coords = feature?.geometry?.coordinates
  const lon = Array.isArray(coords) ? coords[0] : null
  const lat = Array.isArray(coords) ? coords[1] : null

  return {
    id: `${p.osm_type ?? ''}${p.osm_id ?? ''}` || label,
    label,
    strasse,
    hausnummer,
    strasseKomplett,
    plz,
    ort,
    bundesland: bundeslandKuerzel(p.state),
    lat: typeof lat === 'number' ? lat : null,
    lon: typeof lon === 'number' ? lon : null,
  }
}

export async function adressSuche(query: string, signal?: AbortSignal): Promise<AdressVorschlag[]> {
  const q = query.trim()
  if (q.length < 3) return []

  const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&lang=de&limit=5&bbox=${DE_BBOX}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`)

  const data = await res.json()
  const features: PhotonFeature[] = Array.isArray(data?.features) ? data.features : []

  return features.map(featureZuVorschlag).filter((v): v is AdressVorschlag => v !== null)
}
