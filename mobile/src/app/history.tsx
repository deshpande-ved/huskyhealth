import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'

import { HealthKit } from '../../modules/health-kit'
import { C, mono } from '../lib/theme'

// Past reports, kept on this phone only (a file iOS encrypts while the phone is locked). No account, no server.
export default function History() {
  const [rows, setRows] = useState<{ at: string; call: string; fitness: number; fatigue: number; form: number; workouts: number }[]>(
    () => (HealthKit?.historyList() ?? []).map((l) => JSON.parse(l)).reverse())
  const clear = () => { HealthKit?.historyClear(); setRows([]) }
  return (
    <ScrollView style={{ backgroundColor: C.base }} contentContainerStyle={{ padding: 20, paddingTop: 70, gap: 12 }}>
      <Pressable onPress={() => router.back()}><Text style={{ ...mono, color: C.foam }}>{'< back'}</Text></Pressable>
      <Text style={{ ...mono, color: C.iris, letterSpacing: 2 }}>[ HISTORY · ON THIS PHONE ]</Text>
      {rows.length === 0 ? <Text style={{ ...mono, color: C.muted }}>No reports yet. Each time you read Health, a report is saved here.</Text> : null}
      {rows.map((r) => (
        <View key={r.at} style={{ borderLeftWidth: 2, borderLeftColor: C.pine, backgroundColor: C.surface, padding: 12, gap: 4 }}>
          <Text style={{ ...mono, color: C.muted }}>{r.at}</Text>
          <Text style={{ ...mono, fontSize: 18, color: r.call === 'Train hard' ? C.gold : r.call === 'Go easy' ? C.foam : C.muted }}>{r.call}</Text>
          <Text style={mono}>fitness {r.fitness} · fatigue {r.fatigue} · form {r.form} · {r.workouts} workouts</Text>
        </View>
      ))}
      {rows.length ? <Pressable onPress={clear}><Text style={{ ...mono, color: C.love }}>Delete all history</Text></Pressable> : null}
    </ScrollView>
  )
}
