// The ASCII husky, drawn from the same grid as the website's header logo (web/art/husky.json via
// scripts/make_mark.py svg(): monospace advance 0.6 em, line height twice the advance, transparent background).
import { memo } from 'react'
import Svg, { G, Text } from 'react-native-svg'

import art from '../../../web/art/husky.json'

const SIZE = 512
const { cols, rows, chars, rgb } = art as { cols: number; rows: number; chars: string[]; rgb: string[][] }
const ADV = SIZE / cols
const LH = ADV * 2
const TOP = (SIZE - LH * rows) / 2

export const Mark = memo(function Mark({ size = 52 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`} accessibilityElementsHidden importantForAccessibility="no">
      <G fontFamily="Menlo" fontSize={ADV / 0.6} fontWeight="700">
        {chars.flatMap((line, r) => [...line].map((ch, c) => (ch === ' ' ? null : (
          <Text key={`${r}.${c}`} x={ADV * c} y={TOP + LH * (r + 0.78)} fill={rgb[r][c]}>{ch}</Text>
        ))))}
      </G>
    </Svg>
  )
})
