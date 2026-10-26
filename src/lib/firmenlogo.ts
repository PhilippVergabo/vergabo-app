// Firmenlogo wählen, verkleinern, hochladen — Spiegel des Logo-Uploads im
// Web-Profil (vergabo/app/dashboard/anbieter/profil, lib/bildVerkleinern.ts).
//
// Ablauf wie dort: Bild auf höchstens 1000 px Kante bringen und so lange als
// JPEG nachkomprimieren, bis es unter 1 MB passt (PNG bleibt PNG, solange es
// passt — Transparenz) → Upload nach anbieter-logos/{anbieter_id}/logo.{ext}
// → serverseitige Magic-Byte-Prüfung (/api/datei-verifizieren, Bearer) →
// erst dann logo_dateiname setzen. Das Logo steht auf den Angebots-PDFs.
//
// Ohne Zuschnitt: allowsEditing schneidet auf iOS immer quadratisch zu, und
// Logos sind meist breiter als hoch.
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/authedFetch'

const BUCKET = 'anbieter-logos'
export const LOGO_MAX_BYTES = 1024 * 1024
export const LOGO_MAX_KANTE = 1000
/** Wie im Web: unter 0,6 sieht ein Logo nicht mehr gut aus. */
const QUALITAETSSTUFEN = [0.9, 0.8, 0.7, 0.6]

export function logoUrl(anbieterId: string, dateiname: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(`${anbieterId}/${dateiname}`).data.publicUrl
}

type Bild = { bytes: ArrayBuffer; endung: 'png' | 'jpg'; contentType: string }

async function lies(uri: string): Promise<ArrayBuffer> {
  return (await fetch(uri)).arrayBuffer()
}

/** Bringt das gewählte Bild unter beide Grenzen — oder null, wenn es nicht passt. */
async function verkleinere(asset: ImagePicker.ImagePickerAsset): Promise<Bild | null> {
  const laengste = Math.max(asset.width, asset.height)
  const kontext = ImageManipulator.manipulate(asset.uri)
  if (laengste > LOGO_MAX_KANTE) {
    kontext.resize(asset.width >= asset.height ? { width: LOGO_MAX_KANTE } : { height: LOGO_MAX_KANTE })
  }
  const bild = await kontext.renderAsync()
  try {
    if (asset.mimeType === 'image/png') {
      const png = await bild.saveAsync({ format: SaveFormat.PNG })
      const bytes = await lies(png.uri)
      if (bytes.byteLength <= LOGO_MAX_BYTES) return { bytes, endung: 'png', contentType: 'image/png' }
    }
    // Alles andere (auch HEIC vom iPhone) wird JPEG.
    for (const compress of QUALITAETSSTUFEN) {
      const jpeg = await bild.saveAsync({ format: SaveFormat.JPEG, compress })
      const bytes = await lies(jpeg.uri)
      if (bytes.byteLength <= LOGO_MAX_BYTES) return { bytes, endung: 'jpg', contentType: 'image/jpeg' }
    }
    return null
  } finally {
    bild.release()
    kontext.release()
  }
}

export type LogoErgebnis =
  | { ok: true; dateiname: string }
  | { ok: false; abgebrochen: true }
  | { ok: false; abgebrochen: false; fehler: string }

/**
 * Öffnet die Fotoauswahl und lädt das gewählte Bild als Logo des Betriebs
 * hoch. `bisher` ist der alte Dateiname — hatte er eine andere Endung, wird
 * die alte Datei danach entfernt (sonst bliebe sie im Ordner liegen).
 */
export async function waehleUndLadeLogo(anbieterId: string, bisher: string | null): Promise<LogoErgebnis> {
  // Die Systemauswahl (PHPicker) braucht keine Freigabe für die Mediathek.
  const auswahl = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
  if (auswahl.canceled || !auswahl.assets?.[0]) return { ok: false, abgebrochen: true }

  let bild: Bild | null
  try {
    bild = await verkleinere(auswahl.assets[0])
  } catch {
    return { ok: false, abgebrochen: false, fehler: 'Das Bild konnte nicht gelesen werden. Bitte wählen Sie ein anderes.' }
  }
  if (!bild) {
    return { ok: false, abgebrochen: false, fehler: 'Das Bild ist auch verkleinert größer als 1 MB. Bitte wählen Sie ein anderes.' }
  }

  const dateiname = `logo.${bild.endung}`
  const pfad = `${anbieterId}/${dateiname}`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(pfad, bild.bytes, { upsert: true, contentType: bild.contentType })
  if (upErr) {
    return { ok: false, abgebrochen: false, fehler: 'Das Logo konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut.' }
  }

  // Magic-Byte-Prüfung VOR dem Speichern der Referenz (wie im Web). Eine
  // abgelehnte Datei löscht die Route selbst.
  const ver = await authedFetch('/api/datei-verifizieren', {
    method: 'POST',
    body: JSON.stringify({ bucket: BUCKET, pfad }),
  }).catch(() => null)
  if (!ver?.ok) {
    return { ok: false, abgebrochen: false, fehler: 'Das Bild hat die Prüfung nicht bestanden.' }
  }

  const { error: dbErr } = await supabase
    .from('anbieter_profile')
    .update({ logo_dateiname: dateiname })
    .eq('id', anbieterId)
  if (dbErr) {
    return { ok: false, abgebrochen: false, fehler: 'Das Logo wurde hochgeladen, aber nicht im Profil gespeichert. Bitte erneut versuchen.' }
  }

  if (bisher && bisher !== dateiname) {
    await supabase.storage.from(BUCKET).remove([`${anbieterId}/${bisher}`]).catch(() => undefined)
  }
  return { ok: true, dateiname }
}
