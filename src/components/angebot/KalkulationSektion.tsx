import { Text, View } from 'react-native'
import { LvEditor } from '@/components/LvEditor'
import { PositionenEditor } from '@/components/PositionenEditor'
import type { LvPosition, LvPreis, Position } from '@/lib/bewerbung'
import { sektionStyles as styles } from './sektionStyles'

type Props = {
  hatLv: boolean
  lvPositionen: LvPosition[]
  /** Nur Bearbeiten-Screen: gespeicherte Einheitspreise vorbefüllen. */
  initialLvPreise?: LvPreis[]
  initialPositionen: Position[]
  /** true = Positionen stammen vom Auftraggeber → Beschreibung/Menge/Einheit gesperrt. */
  positionenVorgegeben?: boolean
  onLvChange: (preise: LvPreis[], summe: number) => void
  onPositionenChange: (positionen: Position[], summe: number) => void
}

// Sektion „Kalkulation": LV-Einheitspreise oder freie Positionen. 1:1 aus
// bewerben.tsx/bearbeiten.tsx verschoben; initialLvPreise nur beim Bearbeiten.
export function KalkulationSektion({
  hatLv,
  lvPositionen,
  initialLvPreise,
  initialPositionen,
  positionenVorgegeben = false,
  onLvChange,
  onPositionenChange,
}: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {hatLv ? 'Leistungsverzeichnis – Einheitspreise' : 'Kalkulation'}
      </Text>
      {hatLv ? (
        <LvEditor positionen={lvPositionen} initialPreise={initialLvPreise} onChange={onLvChange} />
      ) : (
        <PositionenEditor
          initialPositionen={initialPositionen}
          positionenVorgegeben={positionenVorgegeben}
          onChange={onPositionenChange}
        />
      )}
    </View>
  )
}
