import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg'

// Vergabo-Markenzeichen — 1:1 aus public/brand/vergabo-mark-primary.svg des Web-Projekts:
// grünes abgerundetes Quadrat, orange Ecke, weißes „V".
export function VergaboLogo({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <ClipPath id="vg-clip">
          <Rect width={48} height={48} rx={11} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#vg-clip)">
        <Rect width={48} height={48} fill="#3a5a3e" />
        <Path d="M34 0H48V14Z" fill="#c87941" />
        <Path
          d="M13.5 15L24 33.5L34.5 15"
          fill="none"
          stroke="#ffffff"
          strokeWidth={4.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  )
}
