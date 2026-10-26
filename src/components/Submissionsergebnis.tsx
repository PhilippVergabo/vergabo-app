import { StyleSheet, Text, View } from 'react-native'
import { C } from '@/lib/theme'

// Ergebnis der Öffnung für die Bieter (§ 14 Abs. 6 VOB/A). Die Regel — wer es
// sieht, bei welchen Verfahren, aus welcher Quelle — liegt nur im Web
// (`lib/submissionsergebnis.ts`); die App zeigt an, was
// `/api/auftrag/submissionsergebnis/[id]` liefert, und rechnet nichts selbst.
// Deshalb keine doppelt gehaltene Regel, nur dieser Spiegel der Antwort.

export type ErgebnisZeile = {
  lfdNr: number
  firmenname: string
  anschrift: string | null
  endbetragNetto: number | null
  endbetragBrutto: number | null
  mwstSatz: number | null
  verspaetet: boolean
  eigenes: boolean
}

export type Submissionsergebnis = {
  geoeffnetAm: string
  anzahl: number
  zeilen: ErgebnisZeile[]
}

// Wortgleich mit NACHLAESSE_NEBENANGEBOTE_HINWEIS im Web.
const HINWEIS =
  'Preisnachlässe ohne Bedingungen und Nebenangebote sieht Vergabo bei der Angebotsabgabe nicht vor; ' +
  'es liegen daher keine vor.'

const euro = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

function datumZeit(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Berlin',
  })
}

export function SubmissionsergebnisKarte({ ergebnis }: { ergebnis: Submissionsergebnis }) {
  const { zeilen, anzahl, geoeffnetAm } = ergebnis
  return (
    <View style={styles.karte}>
      <Text style={styles.titel}>Ergebnis der Öffnung</Text>
      <Text style={styles.unter}>
        Geöffnet am {datumZeit(geoeffnetAm)} Uhr · {anzahl === 1 ? '1 Angebot' : `${anzahl} Angebote`}.
        Sichtbar nur für die Bieter dieses Verfahrens (§ 14 Abs. 6 VOB/A).
      </Text>

      {zeilen.map((z) => (
        <View
          key={z.lfdNr}
          style={[styles.zeile, z.eigenes && styles.zeileEigen]}
          accessible
          accessibilityLabel={
            `${z.lfdNr}. ${z.firmenname}${z.eigenes ? ', Ihr Angebot' : ''}, ` +
            (z.endbetragNetto != null ? `${euro(z.endbetragNetto)} netto` : 'ohne Betrag')
          }
        >
          <View style={styles.links}>
            <Text style={styles.name}>
              {z.lfdNr}. {z.firmenname}
            </Text>
            {z.eigenes ? <Text style={styles.eigenChip}>Ihr Angebot</Text> : null}
            <Text style={styles.klein}>{z.anschrift ?? 'Anschrift nicht erfasst'}</Text>
            {z.verspaetet ? (
              <Text style={styles.spaet}>Nach Ablauf der Angebotsfrist eingegangen</Text>
            ) : null}
          </View>
          <View style={styles.rechts}>
            <Text style={styles.betrag}>
              {z.endbetragNetto != null ? euro(z.endbetragNetto) : '—'}
            </Text>
            <Text style={styles.klein}>netto</Text>
            {z.endbetragBrutto != null ? (
              <Text style={styles.klein}>
                {euro(z.endbetragBrutto)} brutto
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      <Text style={styles.klein}>
        Sortiert nach Endbetrag, niedrigster zuerst. Die Reihenfolge ist keine Wertung – die
        Angebote werden danach geprüft und gewertet. {HINWEIS}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  karte: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 10,
  },
  titel: { fontSize: 16, fontWeight: '600', color: C.text },
  unter: { fontSize: 13, color: C.muted, lineHeight: 19 },
  zeile: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 10,
  },
  zeileEigen: { backgroundColor: C.ok, borderColor: '#3a5a3e4d' },
  links: { flex: 1, gap: 2 },
  rechts: { alignItems: 'flex-end', gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: C.text },
  eigenChip: {
    alignSelf: 'flex-start',
    backgroundColor: C.primary,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  betrag: { fontSize: 15, fontWeight: '600', color: C.text, fontVariant: ['tabular-nums'] },
  klein: { fontSize: 12, color: C.muted, lineHeight: 17 },
  spaet: { fontSize: 12, color: C.accent },
})
