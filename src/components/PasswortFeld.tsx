import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { C } from '@/lib/theme'

// Platz rechts im Feld, damit der eingegebene Text nicht unter das Icon läuft:
// 20px Icon + 2×12px Innenabstand des Umschalters.
const ICON_PLATZ = 44

/**
 * Passwort-Eingabefeld mit Sichtbarkeits-Umschalter (Augen-Symbol) — das
 * App-Gegenstück zu components/PasswortFeld.tsx im Web-Projekt (gleiche
 * Icon-Pfade, gleiche Beschriftung).
 *
 * Verhält sich wie ein normales <TextInput>: alle Props (value, onChangeText,
 * placeholder, editable, style …) werden durchgereicht. Intern wird lediglich
 * secureTextEntry zwischen true (Standard, verborgen) und false (sichtbar)
 * umgeschaltet — deshalb ist die Prop bewusst nicht von außen setzbar.
 */
export function PasswortFeld({ style, ...props }: Omit<TextInputProps, 'secureTextEntry'>) {
  const [sichtbar, setSichtbar] = useState(false)

  return (
    <View style={styles.wrapper}>
      <TextInput
        {...props}
        // paddingRight NACH dem übergebenen style: der Platz fürs Icon bleibt
        // auch dann frei, wenn der Aufrufer eigenes Padding mitbringt.
        style={[style, styles.input]}
        secureTextEntry={!sichtbar}
      />
      <Pressable
        onPress={() => setSichtbar((s) => !s)}
        hitSlop={8}
        style={styles.umschalter}
        accessibilityRole="button"
        accessibilityLabel={sichtbar ? 'Passwort verbergen' : 'Passwort anzeigen'}
        accessibilityState={{ selected: sichtbar }}
      >
        {sichtbar ? (
          // Auge durchgestrichen (sichtbar → Tippen verbirgt wieder)
          <Svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.muted}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <Line x1={1} y1={1} x2={23} y2={23} />
          </Svg>
        ) : (
          // Auge (verborgen → Tippen zeigt an)
          <Svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.muted}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <Circle cx={12} cy={12} r={3} />
          </Svg>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  input: { paddingRight: ICON_PLATZ },
  umschalter: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
})
