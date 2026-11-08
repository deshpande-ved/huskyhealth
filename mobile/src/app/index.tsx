import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { TwoPane } from '../components/two-pane'
import { useDuoLayout } from '../lib/use-duo-layout'

import { HealthKit } from '../../modules/health-kit'
import { loadFeatures } from '../lib/health'
import { C, mono } from '../lib/theme'
// @ts-expect-error plain ES module shared with the website: the same ASCII figures as huskyhealth.pages.dev
import { todayModel, dateLabel } from '../../../web/js/view.js'
// @ts-expect-error same block-letter font as the website's call
import { banner } from '../../../web/js/ascii.js'

type Cell = { ch: string; cls: string }
type Fig = { id: string; title?: string; summary?: string; label: string; rows: Cell[][]; headline?: string; reason?: string; basis?: string }

const CLS: Record<string, string> = { z0: C.muted, muted: C.muted, z1: C.foam, z2: C.pine, z3: C.gold, z4: C.rose, z5: C.love, alert: C.love }

// A row of the printout, as on the website: title, one plain sentence, the ASCII figure.
function Row({ fig }: { fig: Fig }) {
  return (
    <View style={{ borderTopWidth: 1, borderColor: C.rule, borderStyle: 'dashed', paddingVertical: 18, gap: 6 }}>
      <Text style={{ ...mono, fontSize: 17, fontWeight: '700' }}>{fig.title}</Text>
      {fig.summary ? <Text style={{ ...mono, color: C.muted, fontSize: 13, lineHeight: 19 }}>{fig.summary}</Text> : null}
      <View accessible accessibilityRole="image" accessibilityLabel={fig.label} style={{ marginTop: 6 }}>
        {fig.rows.map((row, r) => (
          <Text key={r} style={{ fontFamily: 'Menlo', fontSize: 12, lineHeight: 17 }}>
            {row.map((c, i) => <Text key={i} style={{ color: CLS[c.cls] ?? C.text }}>{c.ch}</Text>)}
          </Text>
        ))}
      </View>
    </View>
  )
}

// The call in block letters, sized to fit the screen width.
function Banner({ word, width }: { word: string; width: number }) {
  const lines: string[] = banner(word.toUpperCase())
  const cols = Math.max(...lines.map((l) => l.length))
  const size = Math.min(16, (width - 40) / (cols * 0.64))   // Menlo advance is ~0.6 em; leave a margin
  return (
    <Text accessibilityRole="header" accessibilityLabel={word} style={{ fontFamily: 'Menlo', fontWeight: '700', color: C.love, fontSize: size, lineHeight: size * 1.05 }}>
      {lines.join('\n')}
    </Text>
  )
}

export default function Today() {
  const [status, setStatus] = useState('Reading Apple Health…')
  const [call, setCall] = useState<Fig | null>(null)
  const [figs, setFigs] = useState<Fig[]>([])

  const read = useCallback(async () => {
    try {
      if (!HealthKit) return setStatus('HealthKit is only available on iPhone.')
      await HealthKit.requestAuthorization()
      const { features, analysis } = await loadFeatures()
      // Same model as the website (web/js/view.js): call, this week, last session, zones.
      const m = todayModel(analysis, features)
      setCall(m.call)
      setFigs([m.week, m.last, m.zones].filter(Boolean) as Fig[])
      const n = features.workouts.length
      setStatus(`${n} workout${n === 1 ? '' : 's'} in the last 60 days`)
      const ff = analysis.fitnessFatigue
      HealthKit.historyAppend(JSON.stringify({
        at: new Date().toLocaleString(), call: m.call.headline, workouts: features.workouts.length,
        fitness: Math.round(ff.fitness), fatigue: Math.round(ff.fatigue), form: Math.round(ff.form),
      }))
    } catch (e) {
      setStatus(`Could not read Health: ${(e as Error).message}`)
    }
  }, [])

  useEffect(() => { read() }, [read])

  const seed = async () => {
    if (!HealthKit) return
    setStatus('Adding a demo squash session to Health…')
    try {
      await HealthKit.requestAuthorization()
      const ok = await HealthKit.seedDemoWorkout('squash', 45, 15)
      if (!ok) return setStatus('Health did not save the demo workout.')
      await read()
    } catch (e) {
      setStatus(`Demo workout failed: ${(e as Error).message}`)
    }
  }

  const { width } = useWindowDimensions()
  const inset = useSafeAreaInsets()   // keeps the account button clear of the camera and status cluster
  const layout = useDuoLayout()
  const btn = { borderWidth: 1, borderColor: C.text, paddingVertical: 10, paddingHorizontal: 14 } as const

  // The same pieces in every posture (see src/lib/use-duo-layout.ts and src/components/two-pane.tsx):
  const header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderColor: C.text, paddingBottom: 12 }}>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ ...mono, fontSize: 20, fontWeight: '700' }}>HuskyHealth</Text>
        <Text style={{ ...mono, color: C.muted, fontSize: 12, marginTop: 2 }}>Your workouts, as an API only you can read.</Text>
      </View>
      <Pressable onPress={() => router.push('/sync')} style={btn}><Text style={{ ...mono, fontSize: 13 }}>account</Text></Pressable>
    </View>
  )
  const callBlock = (bannerWidth: number) => (
    <View style={{ paddingVertical: 18, gap: 12 }}>
      {call?.headline ? <Banner word={call.headline} width={bannerWidth} /> : <Text style={{ ...mono, color: C.muted }}>…</Text>}
      {call?.reason ? <Text style={{ ...mono, fontSize: 16, lineHeight: 23 }}>{call.reason}</Text> : null}
      <Text style={{ ...mono, color: C.muted, fontSize: 13 }}>{call?.basis ? `${dateLabel(0)}, ${call.basis}. ${status}.` : status}</Text>
    </View>
  )
  const rows = <View style={{ borderTopWidth: 1, borderColor: C.text }}>{figs.map((f) => <Row key={f.id} fig={f} />)}</View>
  const actions = (
    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
      <Pressable onPress={read} style={btn}><Text style={{ ...mono, fontSize: 13 }}>refresh</Text></Pressable>
      <Pressable onPress={() => router.push('/history')} style={btn}><Text style={{ ...mono, fontSize: 13 }}>history</Text></Pressable>
      <Pressable onPress={seed} style={{ ...btn, borderColor: C.muted }}><Text style={{ ...mono, color: C.muted, fontSize: 13 }}>demo workout</Text></Pressable>
    </View>
  )
  const pad = { padding: 18, paddingRight: 18 + inset.right, gap: 14 }

  if (layout.wide) {
    // Unfolded, side by side (columns): the call and its buttons on the left, the evidence on the right.
    // Half folded like a laptop (rows): the call stands up on the top half to be read; the rows and the
    // buttons lie flat on the bottom half, under the thumbs. Nothing sits on the crease.
    const isRows = layout.mode === 'rows'
    const leftWidth = isRows ? width - inset.left - inset.right : Math.max(320, layout.split.left - inset.left)
    return (
      <View style={{ flex: 1, backgroundColor: C.base, paddingTop: inset.top, paddingLeft: inset.left }}>
        <TwoPane layout={layout}
          left={<ScrollView contentContainerStyle={{ ...pad, paddingBottom: 24 }}>{header}{callBlock(leftWidth)}{isRows ? null : actions}</ScrollView>}
          right={<ScrollView contentContainerStyle={{ ...pad, paddingTop: isRows ? 12 : 18 + 58, paddingBottom: 40 + inset.bottom }}>{rows}{isRows ? actions : null}</ScrollView>}
        />
      </View>
    )
  }

  return (
    <ScrollView style={{ backgroundColor: C.base }} contentContainerStyle={{ ...pad, paddingTop: inset.top + 16, paddingBottom: 60 + inset.bottom }}>
      {header}
      {callBlock(width - inset.right - inset.left)}
      {rows}
      {actions}
    </ScrollView>
  )
}
