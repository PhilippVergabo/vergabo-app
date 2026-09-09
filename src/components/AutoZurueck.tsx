import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { C } from '@/lib/theme'

/**
 * Countdown auf einem Erfolgs-Screen: zeigt die verbleibenden Sekunden an und
 * ruft nach Ablauf `onAblauf` auf (in der Regel die Rück-Navigation).
 *
 * Der Button bleibt daneben bestehen — wer nicht warten will, tippt weiter
 * selbst. Der Countdown nimmt nur die Pflicht ab, überhaupt tippen zu müssen.
 *
 * Das Ziel kommt bewusst als Rückruf statt als Route: Die beiden Aufrufer
 * springen unterschiedlich zurück (Übersicht bzw. Ausschreibung), und so bleibt
 * die getippte Route dort, wo sie hingehört.
 */
export function AutoZurueck({
  onAblauf,
  sekunden = 10,
}: {
  onAblauf: () => void
  sekunden?: number
}) {
  const [rest, setRest] = useState(sekunden)

  // Der Rückruf steckt in einer Ref, damit der Intervall nicht bei jedem Render
  // neu startet — die Aufrufer übergeben eine Inline-Funktion, die sich jedes
  // Mal ändert. Ohne Ref liefe der Countdown nie ab.
  const rueckruf = useRef(onAblauf)
  useEffect(() => {
    rueckruf.current = onAblauf
  })

  useEffect(() => {
    const timer = setInterval(() => setRest((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (rest === 0) rueckruf.current()
  }, [rest])

  return (
    <Text
      style={styles.hinweis}
      // Ohne festes Label würde VoiceOver bei jedem Fokus die gerade aktuelle
      // Zahl vorlesen; die Aussage ist aber der automatische Rücksprung.
      accessibilityLabel={`Es wird in ${rest} Sekunden automatisch zurückgewechselt.`}
    >
      Automatisch in {rest} Sekunde{rest === 1 ? '' : 'n'}
    </Text>
  )
}

const styles = StyleSheet.create({
  hinweis: { fontSize: 13, color: C.muted, textAlign: 'center' },
})
