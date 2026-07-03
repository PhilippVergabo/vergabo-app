// Zentraler Fetch-Helfer für Bearer-authentifizierte Aufrufe an die
// Web-Plattform. Vorher in mehreren Screens dupliziert (admin, Rueckfragen,
// eigenerklarungen, AuftraggeberHome, bewerben, bearbeiten).
import { supabase } from '@/lib/supabase'
import { API_URL } from '@/lib/config'

/**
 * Führt einen Fetch gegen die Vergabo-API aus: holt das Session-Token,
 * setzt `Authorization: Bearer …` und prefixt `API_URL`.
 *
 * Content-Type: Bei String-Body (JSON) wird automatisch
 * `application/json` gesetzt (sofern nicht explizit übergeben). Bei FormData
 * wird bewusst KEIN Content-Type gesetzt — fetch ergänzt die
 * multipart-Boundary selbst, ein manueller Header würde sie zerstören.
 */
export async function authedFetch(pfad: string, init?: RequestInit): Promise<Response> {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token

  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (typeof init?.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  return fetch(`${API_URL}${pfad}`, { ...init, headers })
}
