// A detail page (web: #week #session #zones #sleep #fitness): the same blocks the website draws, from
// web/js/view.js detailBlocks, so every word, number and table matches. Tables scroll sideways, as on the site.
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PaperScroll } from '../../components/paper'
import { openRef } from '../../components/page-blocks'
import { getToday } from '../../lib/today-store'
import { C, bold, mono, link, methodLink } from '../../lib/theme'
import { DETAIL_PAGES, detailBlocks } from '../../../../web/js/view.js'

type Cell = string | { ch: string; cls: string } | { stack: { ch: string; cls: string }[] }
type Block =
  | { t: 'lede' | 'subhead' | 'empty'; text: string }
  | { t: 'facts'; items: [string, string][] }
  | { t: 'stack'; cells: { ch: string; cls: string }[] }
  | { t: 'table'; head: string[]; rows: Cell[][]; num?: number[]; narrow?: boolean }
  | { t: 'method'; source: { citation: string; status: string }; ref: string }

const SIZE = 14
const CH = SIZE * 0.6125                      // Space Mono advance: every character is the same width
const zone = (cls: string) => (({ z0: C.muted, muted: C.muted, z1: C.foam, z2: C.pine, z3: C.gold, z4: C.rose, z5: C.love, alert: C.love }) as Record<string, string>)[cls] ?? C.text
const textOf = (c: Cell) => (typeof c === 'string' ? c : 'stack' in c ? c.stack.map((x) => x.ch).join('') : c.ch)

function CellText({ c }: { c: Cell }) {
  if (typeof c === 'string') return <>{c}</>
  if ('stack' in c) return <>{c.stack.map((x, i) => <Text key={i} style={{ color: zone(x.cls) }}>{x.ch}</Text>)}</>
  return <Text style={{ color: zone(c.cls) }}>{c.ch}</Text>
}

function Table({ head, rows, num = [] }: { head: string[]; rows: Cell[][]; num?: number[] }) {
  // column width = its longest entry, in characters (monospace), plus the site's 16 px gap
  const widths = head.map((h, i) => Math.ceil(Math.max(h.length, ...rows.map((r) => textOf(r[i]).length)) * CH) + 16)
  const align = (i: number) => (num.includes(i) ? 'right' : 'left') as 'right' | 'left'
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
      <View>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: C.text }}>
          {head.map((h, i) => (
            <Text key={i} style={{ ...mono, width: widths[i], paddingRight: 16, paddingVertical: 8, fontSize: 12.8, color: C.muted, textAlign: align(i) }}>{h}</Text>
          ))}
        </View>
        {rows.map((r, j) => (
          <View key={j} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: C.rule, borderStyle: 'dashed' }}>
            {r.map((c, i) => (
              <Text key={i} style={{ ...mono, width: widths[i], paddingRight: 16, paddingVertical: 8, fontSize: SIZE, textAlign: align(i) }}><CellText c={c} /></Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'lede': return <Text style={{ ...mono, fontSize: 16, lineHeight: 24, marginBottom: 16 }}>{b.text}</Text>
    case 'empty': return <Text style={{ ...mono, color: C.text2, fontSize: 14, marginBottom: 16 }}>{b.text}</Text>
    case 'subhead': return <Text style={{ ...bold, fontSize: 18, marginTop: 24, marginBottom: 8 }}>{b.text}</Text>
    case 'stack': return <Text style={{ fontFamily: 'SpaceMono', fontSize: SIZE, marginBottom: 16 }}><CellText c={{ stack: b.cells }} /></Text>
    case 'facts': return (
      <View style={{ marginBottom: 16 }}>
        {b.items.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.rule, borderStyle: 'dashed' }}>
            <Text style={{ ...mono, fontSize: SIZE, color: C.text2 }}>{k}</Text>
            <Text style={{ ...mono, fontSize: SIZE, flexShrink: 1, textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
      </View>
    )
    case 'table': return <Table head={b.head} rows={b.rows} num={b.num} />
    case 'method': return (
      <Text onPress={() => openRef(b.ref)} style={{ ...methodLink(), fontSize: 12.8, marginTop: 8 }}>
        {`method · ${b.source.citation} · ${b.source.status}`}
      </Text>
    )
  }
}

export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const inset = useSafeAreaInsets()
  const t = getToday()
  const title = (DETAIL_PAGES as [string, string][]).find(([k]) => k === id)?.[1] ?? 'Details'
  const blocks = detailBlocks(id, t?.analysis, t?.features, Boolean(t)) as Block[]
  return (
    <PaperScroll contentContainerStyle={{ paddingLeft: 16 + inset.left, paddingRight: 16 + inset.right, paddingTop: inset.top + 24, paddingBottom: 60 + inset.bottom }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="link">
        <Text style={{ ...link(), fontSize: 14 }}>{'← today'}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={{ ...bold, fontSize: 28, marginTop: 16, marginBottom: 16 }}>{title}</Text>
      {blocks.map((b, i) => <BlockView key={i} b={b} />)}
    </PaperScroll>
  )
}
