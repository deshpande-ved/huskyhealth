// The website's continuous-form paper (body background in web/css/style.css): bands three printed lines tall,
// paper and band alternating. Drawn behind scrolling content; height follows the content.
import { useState, type ReactNode } from 'react'
import { ScrollView, View, type ScrollViewProps } from 'react-native'

import { C, LINE } from '../lib/theme'

export function Bands({ height }: { height: number }) {
  const n = Math.ceil(height / (LINE * 6)) + 1
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ height: LINE * 6 }}>
          <View style={{ height: LINE * 3, backgroundColor: C.base }} />
          <View style={{ height: LINE * 3, backgroundColor: C.surface }} />
        </View>
      ))}
    </View>
  )
}

/** A ScrollView on banded paper. */
export function PaperScroll({ children, contentContainerStyle, ...rest }: ScrollViewProps & { children: ReactNode }) {
  const [h, setH] = useState(0)
  return (
    <ScrollView style={{ backgroundColor: C.base }} {...rest} contentContainerStyle={contentContainerStyle}
      onContentSizeChange={(_, ch) => setH(ch)}>
      <Bands height={Math.max(h, 2000)} />
      {children}
    </ScrollView>
  )
}
