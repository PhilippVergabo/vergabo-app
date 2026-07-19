// Umkreis-Logik der Web-Plattform, client-seitig gespiegelt
// (Web: lib/geoDistance.ts + lib/plzDistance.ts — gleiche Formel, gleiche API).

export type Koordinaten = { lat: number; lng: number }

/** Luftlinie zweier Koordinaten in km (Haversine-Formel, Erdradius 6 371 km). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// PLZ-Koordinaten ändern sich praktisch nie → einfacher In-Memory-Cache
// für die App-Laufzeit reicht (das Web cached zusätzlich in Redis).
const cache = new Map<string, Koordinaten | null>()

/**
 * PLZ → { lat, lng } über die Photon-API (Komoot/OSM) — dieselbe Quelle wie das
 * Adress-Autocomplete. WICHTIG: OpenPLZ liefert KEINE Koordinaten, daher Photon
 * mit PLZ-Suche (osm_value === 'postcode' → Mittelpunkt des PLZ-Gebiets).
 * null, wenn die PLZ nicht auflösbar ist.
 */
export async function plzKoordinaten(plz: string): Promise<Koordinaten | null> {
  const cached = cache.get(plz)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(`${plz} Deutschland`)}&lang=de&limit=3`,
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    type Feature = {
      properties?: { osm_value?: string; name?: string; postcode?: string; countrycode?: string }
      geometry?: { coordinates?: [number, number] }
    }
    const features: Feature[] = Array.isArray(data?.features) ? data.features : []
    const treffer = features.find(
      f =>
        f?.properties?.osm_value === 'postcode' &&
        f?.properties?.countrycode === 'DE' &&
        (f?.properties?.name === plz || f?.properties?.postcode === plz),
    )
    const coords = treffer?.geometry?.coordinates
    const k = Array.isArray(coords) ? { lat: coords[1], lng: coords[0] } : null
    cache.set(plz, k)
    return k
  } catch {
    // Fehler nicht cachen — kann vorübergehend sein (offline, Timeout).
    return null
  }
}
