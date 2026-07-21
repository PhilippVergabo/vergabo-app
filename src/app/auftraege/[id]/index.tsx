import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
// HINWEIS: expo-file-system/expo-sharing sind NATIVE Module, die erst nach dem
// letzten Dev-Build hinzukamen. Top-Level-Imports würden die Route (und damit
// die ganze App) in älteren Builds beim Laden crashen ("Cannot find native
// module 'ExpoSharing'") — daher lazy require erst beim Button-Tap, mit
// sauberem Hinweis, falls der Build die Module noch nicht enthält.
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/authedFetch'
import { budgetRange } from '@/lib/budgetRange'
import { dateiWaehlen, type PickedFile } from '@/lib/bewerbung'
import { sanitizeDateiname } from '@/lib/eigenerklarungTypen'
import { gewerkLabel } from '@/lib/labels'
import { Rueckfragen } from '@/components/Rueckfragen'
import { C } from '@/lib/theme'

type AuftragDetail = {
  id: string
  titel: string
  beschreibung: string | null
  gewerk: string | null
  ausfuehrungsort_adresse: string | null
  ausfuehrungsort_plz: string | null
  ausfuehrungsort_ort: string | null
  frist: string | null
  budget_max: number | null
  status: string
}

// Spiegel der GET-/PATCH-Antwort von /api/nachforderung (Web-Plattform).
type Nachforderung = {
  id: string
  bewerbung_id: string
  auftrag_id: string
  beschreibung: string
  frist: string
  status: string
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

export default function AuftragDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [auftrag, setAuftrag] = useState<AuftragDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [meineBewerbung, setMeineBewerbung] = useState<{ id: string; status: string } | null>(null)
  const [nachforderungen, setNachforderungen] = useState<Nachforderung[]>([])
  const [nfDateien, setNfDateien] = useState<Record<string, PickedFile[]>>({})
  const [nfBusy, setNfBusy] = useState<string | null>(null)
  const [nachgereicht, setNachgereicht] = useState<Record<string, boolean>>({})
  const [zieheZurueck, setZieheZurueck] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  // Nach Abschluss durch den AG: die eigene erhaltene Bewertung (RLS liefert
  // die Zeile nur für den bewerteten Anbieter — für alle anderen null).
  const [erhalteneBewertung, setErhalteneBewertung] = useState<{
    sterne: number
    kommentar: string | null
  } | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  const laden = useCallback(async () => {
    if (!id) return
    const [{ data: a }, { data: b }, { data: bw }] = await Promise.all([
      supabase
        .from('auftraege')
        .select(
          'id, titel, beschreibung, gewerk, ausfuehrungsort_adresse, ausfuehrungsort_plz, ausfuehrungsort_ort, frist:angebotsfrist, budget_max:budget_bis, status',
        )
        .eq('id', id)
        .single(),
      // Zurückgezogene Angebote zählen nicht als "bereits beworben" — nach dem
      // Zurückziehen erscheint wieder der "Angebot abgeben"-CTA.
      supabase
        .from('bewerbungen')
        .select('id, status')
        .eq('auftrag_id', id)
        .neq('status', 'zurueckgezogen')
        .limit(1),
      supabase.from('bewertungen').select('sterne, kommentar').eq('auftrag_id', id).maybeSingle(),
    ])
    setAuftrag(a as AuftragDetail | null)
    const meine = (b ?? [])[0] as { id: string; status: string } | undefined
    setMeineBewerbung(meine ?? null)
    setErhalteneBewertung((bw as { sterne: number; kommentar: string | null } | null) ?? null)

    // Offene Nachforderungen zur eigenen Bewerbung (Bearer-API der Web-Plattform).
    if (meine) {
      try {
        const res = await authedFetch(`/api/nachforderung?bewerbung_ids=${meine.id}`)
        if (res.ok) {
          const liste = (await res.json()) as Nachforderung[]
          setNachforderungen(Array.isArray(liste) ? liste : [])
        }
      } catch {
        // Nicht-fatal: Detailansicht funktioniert auch ohne Nachforderungs-Info.
      }
    } else {
      setNachforderungen([])
    }
    setLoading(false)
  }, [id])

  // Bei jedem Fokus neu laden — so erscheint nach dem Einreichen sofort der
  // "bereits beworben"-Status.
  useFocusEffect(
    useCallback(() => {
      void laden()
    }, [laden]),
  )

  // ── Nachforderung: Datei zur Auswahl hinzufügen ────────────────────────────
  async function nfDateiHinzufuegen(nfId: string) {
    const file = await dateiWaehlen()
    if (!file) return
    setNfDateien((prev) => {
      const vorhanden = prev[nfId] ?? []
      // Doppelte Namen ersetzen (Upload nutzt upsert, letzter gewinnt)
      return { ...prev, [nfId]: [...vorhanden.filter((f) => f.name !== file.name), file] }
    })
  }

  function nfDateiEntfernen(nfId: string, name: string) {
    setNfDateien((prev) => ({ ...prev, [nfId]: (prev[nfId] ?? []).filter((f) => f.name !== name) }))
  }

  // ── Nachforderung: Upload + Erfüllt-Meldung (Spiegel Web NachforderungBanner) ──
  // Pfad + Verifikation exakt wie der Web-Anbieter: Upload nach
  // bewerbung-anhaenge/{bewerbung_id}/nachforderung/{name}, danach serverseitige
  // Magic-Byte-Verifikation, erst dann PATCH /api/nachforderung.
  async function nachreichen(nf: Nachforderung) {
    const dateien = nfDateien[nf.id] ?? []
    if (dateien.length === 0 || nfBusy) return
    setNfBusy(nf.id)
    try {
      const hochgeladeneNamen: string[] = []
      for (const file of dateien) {
        const sicherName = sanitizeDateiname(file.name)
        const pfad = `${nf.bewerbung_id}/nachforderung/${sicherName}`
        const bytes = await (await fetch(file.uri)).arrayBuffer()
        const { error } = await supabase.storage
          .from('bewerbung-anhaenge')
          .upload(pfad, bytes, {
            upsert: true,
            contentType: file.mimeType ?? 'application/octet-stream',
          })
        if (error) {
          Alert.alert('Upload fehlgeschlagen', `${file.name}: ${error.message}`)
          return
        }
        const ver = await authedFetch('/api/datei-verifizieren', {
          method: 'POST',
          body: JSON.stringify({ bucket: 'bewerbung-anhaenge', pfad }),
        })
        if (!ver.ok) {
          const j = (await ver.json().catch(() => ({}))) as { error?: string }
          Alert.alert('Datei abgelehnt', j.error ?? `${file.name} hat die Prüfung nicht bestanden.`)
          return
        }
        hochgeladeneNamen.push(sicherName)
      }

      const res = await authedFetch('/api/nachforderung', {
        method: 'PATCH',
        body: JSON.stringify({ nachforderung_id: nf.id, dateinamen: hochgeladeneNamen }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        Alert.alert('Fehler', j.error ?? 'Die Unterlagen konnten nicht bestätigt werden.')
        return
      }
      setNachgereicht((prev) => ({ ...prev, [nf.id]: true }))
      setNfDateien((prev) => ({ ...prev, [nf.id]: [] }))
      await laden()
    } catch (e) {
      Alert.alert('Verbindungsfehler', e instanceof Error ? e.message : String(e))
    } finally {
      setNfBusy(null)
    }
  }

  // ── Angebots-PDF nach Zuschlag öffnen ──────────────────────────────────────
  // Bearer-GET auf /api/angebot-pdf/{bewerbungId} (liefert application/pdf),
  // Bytes in den Cache schreiben und über das System-Share-Sheet öffnen
  // (iOS zeigt Quick-Look, Android bietet PDF-Viewer an).
  async function angebotsPdfOeffnen() {
    if (!meineBewerbung || pdfBusy) return
    setPdfBusy(true)
    try {
      const res = await authedFetch(`/api/angebot-pdf/${meineBewerbung.id}`)
      if (res.status === 401) {
        Alert.alert('Sitzung abgelaufen', 'Bitte melden Sie sich erneut an.')
        return
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        Alert.alert('Fehler', j.error ?? 'Das Angebots-PDF konnte nicht geladen werden.')
        return
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      // Lazy require: crasht nicht beim Route-Laden, sondern liefert hier einen
      // verständlichen Hinweis, wenn der installierte Dev-Build die nativen
      // Module (expo-file-system/expo-sharing) noch nicht enthält.
      let FileSystemMod: typeof import('expo-file-system')
      let SharingMod: typeof import('expo-sharing')
      try {
        FileSystemMod = require('expo-file-system')
        SharingMod = require('expo-sharing')
      } catch {
        Alert.alert(
          'App-Update erforderlich',
          'Diese Funktion benötigt eine neuere App-Version (neuer Entwicklungs-Build).',
        )
        return
      }
      // Neue expo-file-system-API (SDK 54): File/Paths statt Legacy-cacheDirectory.
      const file = new FileSystemMod.File(FileSystemMod.Paths.cache, `angebot-${meineBewerbung.id}.pdf`)
      file.create({ overwrite: true, intermediates: true })
      file.write(bytes)
      if (await SharingMod.isAvailableAsync()) {
        await SharingMod.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Angebots-PDF',
        })
      } else {
        Alert.alert(
          'Nicht verfügbar',
          'Das Öffnen von Dateien wird auf diesem Gerät nicht unterstützt.',
        )
      }
    } catch (e) {
      Alert.alert('Verbindungsfehler', e instanceof Error ? e.message : String(e))
    } finally {
      setPdfBusy(false)
    }
  }

  // ── Angebot zurückziehen ───────────────────────────────────────────────────
  function zurueckziehenBestaetigen() {
    Alert.alert(
      'Angebot zurückziehen',
      'Möchten Sie Ihr Angebot wirklich zurückziehen? Dieser Schritt kann nicht rückgängig gemacht werden.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Zurückziehen', style: 'destructive', onPress: () => void zurueckziehen() },
      ],
    )
  }

  async function zurueckziehen() {
    if (!auftrag || !meineBewerbung || zieheZurueck) return
    setZieheZurueck(true)
    try {
      const res = await authedFetch('/api/bewerbung-zurueckziehen', {
        method: 'POST',
        body: JSON.stringify({ bewerbung_id: meineBewerbung.id, auftrag_id: auftrag.id }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        Alert.alert('Zurückziehen fehlgeschlagen', j.error ?? 'Bitte versuchen Sie es später erneut.')
        return
      }
      await laden()
    } catch (e) {
      Alert.alert('Verbindungsfehler', e instanceof Error ? e.message : String(e))
    } finally {
      setZieheZurueck(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    )
  }

  if (!auftrag) {
    return (
      <View style={styles.center}>
        <Text style={styles.mutedText}>Ausschreibung nicht gefunden.</Text>
      </View>
    )
  }

  // Volle Adresse (seit der Wizard-Umstellung Pflicht); ältere Aufträge ohne
  // Adresse fallen auf "PLZ Ort" zurück.
  const plzOrt = [auftrag.ausfuehrungsort_plz, auftrag.ausfuehrungsort_ort].filter(Boolean).join(' ')
  const ort = [auftrag.ausfuehrungsort_adresse, plzOrt].filter(Boolean).join(', ')
  // Anbieter sehen nur die grobe Budget-Klasse (Basis budget_bis), nie exakte Werte.
  const budgetText = auftrag.budget_max != null ? budgetRange(auftrag.budget_max) : null
  // Angebote nur möglich, solange veröffentlicht UND die Angebotsfrist nicht
  // abgelaufen ist (konsistent zum Bearbeiten-Flow).
  const fristAbgelaufen = auftrag.frist ? new Date() >= new Date(auftrag.frist) : false
  const aktiv = auftrag.status === 'veroeffentlicht' && !fristAbgelaufen
  // Offene Nachforderungen mit noch laufender Frist (Spiegel Web-Banner).
  const offeneNachforderungen = nachforderungen.filter(
    (nf) => nf.status === 'offen' && new Date(nf.frist) >= new Date(),
  )

  return (
    <>
      {/* Zurück-Fallback: Wird das Detail ohne Vorgänger-Screen geöffnet
          (z. B. Deeplink/Push bei Kaltstart), gäbe es keinen funktionierenden
          nativen Zurück-Button — dann eigener Button zur Übersicht. */}
      {!router.canGoBack() && (
        <Stack.Screen
          options={{
            headerLeft: () => (
              <Pressable
                onPress={() => router.replace('/')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Zur Übersicht"
              >
                <Text style={{ color: '#3a5a3e', fontSize: 16, fontWeight: '600' }}>‹ Übersicht</Text>
              </Pressable>
            ),
          }}
        />
      )}
    {/* automaticallyAdjustKeyboardInsets: iOS schiebt das Rückfragen-Eingabefeld
        über die Tastatur — auch mit der schwebenden Kopfzeile korrekt (eine
        KeyboardAvoidingView mit 'padding' kompensierte dort zu wenig). */}
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {auftrag.gewerk ? <Text style={styles.gewerk}>{gewerkLabel(auftrag.gewerk)}</Text> : null}
      <Text style={styles.titel}>{auftrag.titel}</Text>

      <View style={styles.metaBlock}>
        {ort ? <Row label="Ort" value={ort} /> : null}
        {auftrag.frist ? <Row label="Frist" value={formatDate(auftrag.frist)!} /> : null}
        {budgetText ? <Row label="Budget" value={budgetText} /> : null}
      </View>

      {auftrag.beschreibung ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beschreibung</Text>
          <Text style={styles.beschreibung}>{auftrag.beschreibung}</Text>
        </View>
      ) : null}

      {/* Bestätigung nach erfolgreichem Nachreichen (Nachforderung ist danach
          nicht mehr "offen" und verschwindet aus der Liste). */}
      {Object.keys(nachgereicht).length > 0 && meineBewerbung ? (
        <View style={styles.nachgereichtBanner}>
          <Text style={styles.nachgereichtText}>Nachgereicht ✓</Text>
          <Text style={styles.nachgereichtHinweis}>
            Ihre Unterlagen wurden übermittelt. Der Auftraggeber wurde benachrichtigt.
          </Text>
        </View>
      ) : null}

      {/* Offene Nachforderungen des Auftraggebers zur eigenen Bewerbung */}
      {offeneNachforderungen.map((nf) => {
        const verbleibendeTage = Math.ceil(
          (new Date(nf.frist).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        )
        const dringend = verbleibendeTage <= 2
        const dateien = nfDateien[nf.id] ?? []
        const busy = nfBusy === nf.id
        return (
          <View key={nf.id} style={[styles.nfBanner, dringend && styles.nfBannerDringend]}>
            <Text style={[styles.nfTitel, dringend && styles.nfTitelDringend]}>
              ⚠️ Unterlagen angefordert
              {dringend && verbleibendeTage > 0
                ? verbleibendeTage === 1
                  ? ' — Noch 1 Tag!'
                  : ` — Noch ${verbleibendeTage} Tage!`
                : ''}
            </Text>
            <Text style={styles.nfBeschreibung}>{nf.beschreibung}</Text>
            <Text style={[styles.nfFrist, dringend && styles.nfTitelDringend]}>
              Frist: {formatDate(nf.frist)}
            </Text>

            {dateien.map((f) => (
              <View key={f.name} style={styles.nfDateiZeile}>
                <Text style={styles.nfDateiName} numberOfLines={1}>
                  📎 {f.name}
                </Text>
                <Pressable
                  onPress={() => nfDateiEntfernen(nf.id, f.name)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.name} entfernen`}
                  hitSlop={8}
                >
                  <Text style={styles.nfDateiEntfernen}>✕</Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.nfAktionen}>
              <Pressable
                style={[styles.nfWaehlenBtn, busy && styles.btnDisabled]}
                onPress={() => void nfDateiHinzufuegen(nf.id)}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.nfWaehlenBtnText}>📎 Datei wählen</Text>
              </Pressable>
              {dateien.length > 0 ? (
                <Pressable
                  style={[styles.nfSendenBtn, busy && styles.btnDisabled]}
                  onPress={() => void nachreichen(nf)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  {busy ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.nfSendenBtnText}>
                      {dateien.length === 1 ? 'Datei nachreichen' : `${dateien.length} Dateien nachreichen`}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
        )
      })}

      <View style={styles.ctaBlock}>
        {meineBewerbung ? (
          <View style={{ gap: 12 }}>
            {meineBewerbung.status === 'zuschlag' ? (
              <View style={styles.zuschlagBanner}>
                <Text style={styles.zuschlagTitel}>
                  {auftrag.status === 'abgeschlossen'
                    ? '🏁 Auftrag abgeschlossen'
                    : '🎉 Sie haben den Zuschlag erhalten!'}
                </Text>
                {auftrag.status === 'abgeschlossen' ? (
                  <View style={styles.abschlussBlock}>
                    <Text style={styles.abschlussText}>
                      Der Auftraggeber hat den Auftrag als abgeschlossen markiert. Vielen Dank
                      für Ihre Arbeit!
                    </Text>
                    {erhalteneBewertung ? (
                      <>
                        <Text style={styles.bewertungSterne}>
                          {'★'.repeat(erhalteneBewertung.sterne)}
                          {'☆'.repeat(5 - erhalteneBewertung.sterne)}
                          <Text style={styles.bewertungZahl}>
                            {'  '}{erhalteneBewertung.sterne} von 5
                          </Text>
                        </Text>
                        {erhalteneBewertung.kommentar ? (
                          <Text style={styles.bewertungKommentar}>
                            „{erhalteneBewertung.kommentar}"
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                ) : null}
                <Pressable
                  style={[styles.pdfButton, pdfBusy && styles.btnDisabled]}
                  onPress={() => void angebotsPdfOeffnen()}
                  disabled={pdfBusy}
                  accessibilityRole="button"
                >
                  {pdfBusy ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.pdfButtonText}>Angebots-PDF öffnen</Text>
                  )}
                </Pressable>
              </View>
            ) : meineBewerbung.status === 'abgelehnt' ? (
              <Text style={styles.abgelehntHinweis}>Ihr Angebot wurde nicht berücksichtigt.</Text>
            ) : (
              <View style={styles.beworbenBanner}>
                <Text style={styles.beworbenText}>Sie haben bereits ein Angebot abgegeben.</Text>
              </View>
            )}
            {aktiv && ['eingereicht', 'in_pruefung'].includes(meineBewerbung.status) ? (
              <>
                <Pressable
                  style={styles.ctaButton}
                  onPress={() => router.push(`/auftraege/${auftrag.id}/bearbeiten`)}
                  accessibilityRole="button"
                >
                  <Text style={styles.ctaButtonText}>Angebot bearbeiten</Text>
                </Pressable>
                <Pressable
                  style={[styles.zurueckziehenButton, zieheZurueck && styles.btnDisabled]}
                  onPress={zurueckziehenBestaetigen}
                  disabled={zieheZurueck}
                  accessibilityRole="button"
                >
                  {zieheZurueck ? (
                    <ActivityIndicator color="#7a3320" size="small" />
                  ) : (
                    <Text style={styles.zurueckziehenButtonText}>Angebot zurückziehen</Text>
                  )}
                </Pressable>
              </>
            ) : null}
          </View>
        ) : aktiv ? (
          <Pressable
            style={styles.ctaButton}
            onPress={() => router.push(`/auftraege/${auftrag.id}/bewerben`)}
            accessibilityRole="button"
          >
            <Text style={styles.ctaButtonText}>Angebot abgeben</Text>
          </Pressable>
        ) : (
          <View style={styles.beworbenBanner}>
            <Text style={styles.beworbenText}>Diese Ausschreibung nimmt keine Angebote mehr an.</Text>
          </View>
        )}
      </View>

      {/* Öffentliches Q&A – auch vor einer Bewerbung möglich (RLS erlaubt es
          für veröffentlichte Aufträge; nur Rollen-Badges, keine Firmennamen). */}
      <Rueckfragen
        auftragId={auftrag.id}
        // Beim Fokus ans Seitenende scrollen (nach der Tastatur-Animation):
        // so liegt zwischen Eingabefeld und Tastatur der content-paddingBottom
        // als Luft, statt dass das Feld direkt an der Tastaturkante klebt.
        onEingabeFokus={() => {
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)
        }}
      />
    </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  mutedText: {
    color: C.muted,
    fontSize: 16,
  },
  gewerk: {
    fontSize: 12,
    color: C.accent,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  titel: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    lineHeight: 30,
  },
  metaBlock: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowLabel: {
    fontSize: 14,
    color: C.muted,
  },
  rowValue: {
    fontSize: 14,
    color: C.text,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  beschreibung: {
    fontSize: 15,
    color: C.text,
    lineHeight: 24,
  },
  ctaBlock: {
    marginTop: 8,
  },
  ctaButton: {
    backgroundColor: C.accent,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  beworbenBanner: {
    backgroundColor: '#3a5a3e18',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a5a3e40',
  },
  beworbenText: {
    fontSize: 15,
    color: C.primary,
    fontWeight: '500',
    textAlign: 'center',
  },
  // ── Zuschlag-Erfolgsbanner + PDF-Button ─────────────────────────────────────
  zuschlagBanner: {
    backgroundColor: C.ok,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a5a3e40',
    padding: 16,
    gap: 12,
  },
  zuschlagTitel: {
    fontSize: 16,
    fontWeight: '700',
    color: C.primary,
    textAlign: 'center',
  },
  abschlussBlock: {
    gap: 6,
    alignItems: 'center',
  },
  abschlussText: {
    fontSize: 13,
    color: C.primary,
    textAlign: 'center',
    lineHeight: 19,
  },
  bewertungSterne: {
    fontSize: 20,
    color: '#e0a83c',
    letterSpacing: 2,
  },
  bewertungZahl: {
    fontSize: 13,
    color: C.primary,
    letterSpacing: 0,
  },
  bewertungKommentar: {
    fontSize: 13,
    color: C.primary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  pdfButton: {
    backgroundColor: C.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  abgelehntHinweis: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    paddingVertical: 8,
  },
  // ── Nachforderungs-Banner (Farbwelt gespiegelt vom Web-NachforderungBanner) ──
  nfBanner: {
    backgroundColor: C.warn,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c879414d',
    padding: 16,
    gap: 6,
  },
  nfBannerDringend: {
    backgroundColor: '#f0dcd2',
    borderColor: '#d6b0a0',
  },
  nfTitel: {
    fontSize: 14,
    fontWeight: '700',
    color: C.accent,
  },
  nfTitelDringend: {
    color: '#7a3320',
  },
  nfBeschreibung: {
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  nfFrist: {
    fontSize: 12,
    color: C.accent,
    fontWeight: '600',
  },
  nfDateiZeile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
    gap: 8,
  },
  nfDateiName: {
    flex: 1,
    fontSize: 13,
    color: C.text,
  },
  nfDateiEntfernen: {
    fontSize: 14,
    color: C.muted,
    fontWeight: '700',
  },
  nfAktionen: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  nfWaehlenBtn: {
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  nfWaehlenBtnText: {
    fontSize: 13,
    color: C.accent,
    fontWeight: '600',
  },
  nfSendenBtn: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nfSendenBtnText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '700',
  },
  nachgereichtBanner: {
    backgroundColor: C.ok,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a5a3e40',
    padding: 16,
    gap: 4,
  },
  nachgereichtText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.primary,
  },
  nachgereichtHinweis: {
    fontSize: 13,
    color: C.text,
  },
  // Dezenter, rotbraun umrandeter Zweitbutton (destruktive Aktion)
  zurueckziehenButton: {
    borderWidth: 1,
    borderColor: '#7a3320',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  zurueckziehenButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7a3320',
  },
  btnDisabled: {
    opacity: 0.5,
  },
})
