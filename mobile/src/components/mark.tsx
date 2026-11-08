// The ASCII husky, from the same grid as the website's header mark (web/art/husky.json), cropped to the husky
// as scripts/make_icons.py does. In dark mode its colours are lifted with the same gamma curve as
// web/art/husky-bright.svg, so it is bright on dark paper; in light mode it keeps its original colours.
import { memo } from 'react'
import { useColorScheme } from 'react-native'
import Svg, { G, Text } from 'react-native-svg'

import art from '../../../web/art/husky.json'

const BRIGHT_GAMMA = 0.42                     // scripts/make_icons.py GAMMA
const SIZE = 512
const grid = art as { cols: number; rows: number; chars: string[]; rgb: string[][] }
const keep = grid.chars.map((l, r) => r).filter((r) => grid.chars[r].trim())
const cols = grid.chars.flatMap((l) => [...l].map((ch, c) => (ch === ' ' ? -1 : c))).filter((c) => c >= 0)
const r0 = keep[0], r1 = keep[keep.length - 1] + 1, c0 = Math.min(...cols), c1 = Math.max(...cols) + 1
const CHARS = grid.chars.slice(r0, r1).map((l) => l.slice(c0, c1))
const RGB = grid.rgb.slice(r0, r1).map((row) => row.slice(c0, c1))
const ADV = Math.min(SIZE / (c1 - c0), SIZE / ((r1 - r0) * 2))
const LH = ADV * 2
const LEFT = (SIZE - ADV * (c1 - c0)) / 2
const TOP = (SIZE - LH * (r1 - r0)) / 2
const bright = (hex: string) => '#' + [1, 3, 5].map((i) => Math.round(255 * (parseInt(hex.slice(i, i + 2), 16) / 255) ** BRIGHT_GAMMA)
  .toString(16).padStart(2, '0')).join('')
const LIT = RGB.map((row) => row.map(bright))

export const Mark = memo(function Mark({ size = 92 }: { size?: number }) {
  const colors = useColorScheme() === 'dark' ? LIT : RGB
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`} accessibilityElementsHidden importantForAccessibility="no">
      <G fontFamily="Menlo" fontSize={ADV / 0.6} fontWeight="700">
        {CHARS.flatMap((line, r) => [...line].map((ch, c) => (ch === ' ' ? null : (
          <Text key={`${r}.${c}`} x={LEFT + ADV * c} y={TOP + LH * (r + 0.78)} fill={colors[r][c]}>{ch}</Text>
        ))))}
      </G>
    </Svg>
  )
})
