import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'

import { HealthKit } from '../../modules/health-kit'
import { loadFeatures } from '../lib/health'
import { C, mono } from '../lib/theme'
// @ts-expect-error plain ES module shared with the website: the same ASCII figures as huskyhealth.pages.dev
import { screenModel, zoneBars } from '../../../web/js/view.js'

type Cell = { ch: string; cls: string }
type Fig = { id: string; title?: string; explain?: string; label: string; rows: Cell[][]; stats?: { k: string; v: string; cls?: string }[]; headline?: string; reason?: string; cls?: string }

const CLS: Record<string, string> = { z0: C.muted, muted: C.muted, z1: C.foam, z2: C.pine, z3: C.gold, z4: C.rose, z5: C.love, alert: C.love }
const SPORT_LABEL: Record<string, string> = { squash: 'Squash', running: 'Run', walking: 'Walk', cycling: 'Ride', strength: 'Strength', hiit: 'HIIT', other: 'Workout' }

function Figure({ fig }: { fig: Fig }) {
  return (
    <View style={{ borderWidth: 1, borderColor: '#6e6a8688', backgroundColor: C.surface, padding: 12, gap: 8 }}>
      {fig.title ? <Text style={{ ...mono, color: C.iris, fontSize: 12, letterSpacing: 1.5 }}>[ {fig.title.toUpperCase()} ]</Text> : null}
      {fig.explain ? <Text style={{ ...mono, color: C.muted, fontSize: 12 }}>{fig.explain}</Text> : null}
      <View accessible accessibilityRole="image" accessibilityLabel={fig.label}>
        {fig.rows.map((row, r) => (
          <Text key={r} style={{ fontFamily: 'Menlo', fontSize: 12.5, lineHeight: 16 }}>
            {row.map((c, i) => <Text key={i} style={{ color: CLS[c.cls] ?? C.text }}>{c.ch}</Text>)}
          </Text>
        ))}
      </View>
      {fig.stats?.length ? (
        <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
          {fig.stats.map((s) => (
            <View key={s.k}>
              <Text style={{ ...mono, fontSize: 20, fontWeight: '700', color: CLS[s.cls ?? ''] ?? C.text }}>{s.v}</Text>
              <Text style={{ ...mono, color: C.muted, fontSize: 10, letterSpacing: 1 }}>{s.k.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export default function Today() {
  const [status, setStatus] = useState('Reading Health on this phone…')
  const [figs, setFigs] = useState<Fig[]>([])
  const [recent, setRecent] = useState<{ day: number; sport: string; min: number; trimp: number }[]>([])

  const read = useCallback(async () => {
    try {
      if (!HealthKit) return setStatus('HealthKit is only available on iPhone.')
      await HealthKit.requestAuthorization()
      const { features, analysis } = await loadFeatures()
      const model: Fig[] = screenModel(analysis, features)
      setFigs([...model, zoneBars(features)])
      setRecent([...features.workouts].reverse().slice(0, 6))
      setStatus(`${features.workouts.length} workouts in the last 60 days · computed on this phone`)
      const ff = analysis.fitnessFatigue
      HealthKit.historyAppend(JSON.stringify({
        at: new Date().toLocaleString(), call: model[0].headline, workouts: features.workouts.length,
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

  const hero = figs[0]
  const age = (d: number) => (d === 0 ? 'today' : d === -1 ? 'yesterday' : `${-d} days ago`)

  return (
    <ScrollView style={{ backgroundColor: C.base }} contentContainerStyle={{ padding: 18, paddingTop: 70, paddingBottom: 60, gap: 16 }}>
      <Text style={{ ...mono, fontSize: 18, fontWeight: '700' }}>HuskyHealth</Text>
      <Text style={{ ...mono, color: C.muted, fontSize: 11 }}>training insight from your watch · computed on this phone</Text>

      <Text style={{ ...mono, color: C.muted, letterSpacing: 2, fontSize: 12, marginTop: 10 }}>{'> TODAY’S CALL'}</Text>
      <Text style={{ ...mono, fontSize: 44, fontWeight: '700', color: CLS[hero?.cls ?? 'muted'] ?? C.muted }}>{hero?.headline ?? '…'}</Text>
      {hero?.reason ? <Text style={{ ...mono, fontSize: 15 }}>{hero.reason}</Text> : null}
      <Text style={{ ...mono, color: C.muted, fontSize: 12 }}>{status}</Text>

      {recent.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ ...mono, color: C.iris, fontSize: 12, letterSpacing: 1.5 }}>[ RECENT WORKOUTS ]</Text>
          {recent.map((w, i) => (
            <Text key={i} style={mono}>
              <Text style={{ color: C.gold }}>{(SPORT_LABEL[w.sport] ?? w.sport).padEnd(9)}</Text>
              {`${Math.round(w.min)} min · load ${Math.round(w.trimp)} · ${age(w.day)}`}
            </Text>
          ))}
        </View>
      ) : null}

      {figs.slice(1).map((f) => <Figure key={f.id} fig={f} />)}

      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Pressable onPress={read} style={{ borderWidth: 1, borderColor: C.foam, padding: 12 }}><Text style={{ ...mono, color: C.foam }}>Refresh</Text></Pressable>
        <Pressable onPress={() => router.push('/sync')} style={{ borderWidth: 1, borderColor: C.muted, padding: 12 }}><Text style={mono}>Sync</Text></Pressable>
        <Pressable onPress={() => router.push('/history')} style={{ borderWidth: 1, borderColor: C.muted, padding: 12 }}><Text style={mono}>History</Text></Pressable>
        <Pressable onPress={seed} style={{ borderWidth: 1, borderColor: C.muted, padding: 12 }}><Text style={{ ...mono, color: C.muted }}>Demo workout</Text></Pressable>
      </View>
    </ScrollView>
  )
}
