// The website's API and Methods pages, drawn in the app from mobile/src/content/pages.json (generated from the
// website's HTML by scripts/build-app-pages.mjs). Links stay inside the app.
import { useRef, type ComponentRef, type ReactNode } from 'react'
import { ScrollView, Text, View, type LayoutChangeEvent } from 'react-native'
import { router, type Href } from 'expo-router'
import { openBrowserAsync } from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PaperScroll } from './paper'
import { C, bold, mono, link } from '../lib/theme'

export type Run = { text: string; b?: boolean; code?: boolean; href?: string; muted?: boolean; status?: boolean }
export type PageBlock =
  | { t: 'h2' | 'h3' | 'pre'; text: string }
  | { t: 'p'; cls: string; runs: Run[] }
  | { t: 'ol'; items: Run[][] }
  | { t: 'table'; head: Run[][]; rows: Run[][][] }
  | { t: 'card'; id: string; title: string; paras: Run[][] }

const SIZE = 14

/** Where a website link goes in the app: the account screen, the API page, a method card, or today. Links to a
 *  paper (doi.org, PubMed) open the paper itself in an in-app reader sheet. */
export function appRoute(href: string): Href {
  const h = href.replace(/^\//, '')
  if (h === '#account' || h === 'account') return '/sync'
  if (h === 'api') return '/api'
  if (h === '#privacy' || h === 'privacy') return '/privacy'
  if (h.startsWith('#ref-')) return { pathname: '/methods', params: { focus: h.slice(1) } }
  return '/'
}
export const openRef = (ref: string) => router.push({ pathname: '/methods', params: { focus: ref } })

export function Runs({ runs, size = SIZE, color }: { runs: Run[]; size?: number; color?: string }) {
  return (
    <>
      {runs.map((r, i) => (
        <Text key={i} onPress={r.href ? () => (/^https?:/.test(r.href!) ? openBrowserAsync(r.href!) : router.push(appRoute(r.href!))) : undefined}
          style={{
            fontFamily: r.b ? 'SpaceMono-Bold' : 'SpaceMono', fontSize: r.code ? size * 0.92 : size,
            color: r.code || r.status ? C.love : r.muted ? C.muted : color ?? C.text,
            ...(r.href ? { color: C.love, textDecorationLine: 'underline', textDecorationColor: C.love } : null),
          }}>{r.text}</Text>
      ))}
    </>
  )
}

const plain = (rs: Run[]) => rs.map((r) => r.text).join('')

function Table({ head, rows }: { head: Run[][]; rows: Run[][][] }) {
  // as on the site: the table fits the screen and cells wrap; a column's share follows its longest entry (monospace),
  // capped so one long sentence can't squeeze the others
  const share = head.map((h, i) => Math.min(30, Math.max(plain(h).length, ...rows.map((r) => plain(r[i] ?? []).length), 6)))
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: C.text }}>
        {head.map((h, i) => (
          <Text key={i} style={{ flex: share[i], paddingRight: 12, paddingVertical: 8 }}><Runs runs={h} size={12.8} color={C.muted} /></Text>
        ))}
      </View>
      {rows.map((r, j) => (
        <View key={j} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: C.rule, borderStyle: 'dashed' }}>
          {r.map((c, i) => <Text key={i} style={{ flex: share[i], paddingRight: 12, paddingVertical: 8, lineHeight: 21 }}><Runs runs={c} /></Text>)}
        </View>
      ))}
    </View>
  )
}

export function Block({ b, focus, onLayout }: { b: PageBlock; focus?: string; onLayout?: (id: string, e: LayoutChangeEvent) => void }) {
  switch (b.t) {
    case 'h2': return <Text accessibilityRole="header" style={{ ...bold, fontSize: 28, marginTop: 16, marginBottom: 16 }}>{b.text}</Text>
    case 'h3': return <Text accessibilityRole="header" style={{ ...bold, fontSize: 18, marginTop: 24, marginBottom: 8 }}>{b.text}</Text>
    case 'p': return (
      <Text style={{ fontSize: b.cls === 'lede' ? 16 : 14, lineHeight: b.cls === 'lede' ? 24 : 21, marginBottom: 16 }}>
        <Runs runs={b.runs} size={b.cls === 'lede' ? 16 : 14} color={b.cls === 'note' ? C.text2 : C.text} />
      </Text>
    )
    case 'pre': return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, borderWidth: 1, borderColor: C.rule }}>
        <Text selectable style={{ fontFamily: 'SpaceMono', fontSize: 12.8, lineHeight: 19, color: C.text, padding: 12 }}>{b.text}</Text>
      </ScrollView>
    )
    case 'ol': return (
      <View style={{ marginBottom: 16, gap: 12 }}>
        {b.items.map((it, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={{ ...mono, color: C.love, fontSize: SIZE, lineHeight: 21 }}>{`${i + 1}.`}</Text>
            <Text style={{ flex: 1, lineHeight: 21 }}><Runs runs={it} /></Text>
          </View>
        ))}
      </View>
    )
    case 'table': return <Table head={b.head} rows={b.rows} />
    case 'card': return (
      <View onLayout={(e) => onLayout?.(b.id, e)}
        style={{ borderWidth: 1, borderColor: focus === b.id ? C.love : C.rule, padding: 16, marginBottom: 16, gap: 6,
                 backgroundColor: focus === b.id ? C.surface : 'transparent' }}>
        <Text style={{ ...bold, fontSize: 17 }}>{b.title}</Text>
        {b.paras.map((p, i) => <Text key={i} style={{ lineHeight: 21 }}><Runs runs={p} color={C.text2} /></Text>)}
      </View>
    )
  }
}

/** A website page in the app: "← today", then its blocks on banded paper. Scrolls to `focus` (a method card). */
export function SitePage({ blocks, focus, footer }: { blocks: PageBlock[]; focus?: string; footer?: ReactNode }) {
  const inset = useSafeAreaInsets()
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const scrolled = useRef(false)
  const onLayout = (id: string, e: LayoutChangeEvent) => {
    if (id !== focus || scrolled.current) return
    scrolled.current = true
    const y = e.nativeEvent.layout.y
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 24), animated: false }), 0)
  }
  return (
    <PaperScroll ref={scroll} contentContainerStyle={{ paddingLeft: 16 + inset.left, paddingRight: 16 + inset.right, paddingTop: inset.top + 24, paddingBottom: 60 + inset.bottom }}>
      <Text onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="link"
        style={{ ...link(), fontSize: 14, alignSelf: 'flex-start' }}>{'← today'}</Text>
      {blocks.map((b, i) => <Block key={i} b={b} focus={focus} onLayout={onLayout} />)}
      {footer}
    </PaperScroll>
  )
}
