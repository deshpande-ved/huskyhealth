import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'

import { HealthKit } from '../../modules/health-kit'
import { C, mono, RELAY } from '../lib/theme'

// Convenience mode: this phone reads real workouts from HealthKit and, when the Watch saves one,
// iOS wakes the app in the background and it posts the drop to your relay. The website (paired
// with the same code) collects and decrypts it. The relay keeps only ciphertext, in memory.
export default function Sync() {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState(HealthKit?.isPaired() ? 'Paired. Background sync is on.' : 'Off (off by default).')

  const pair = async () => {
    if (!HealthKit) return
    await HealthKit.requestAuthorization()
    const r = await HealthKit.pair(RELAY, code)
    setCode('')
    setStatus(!r.ok ? 'That code did not work. Copy it again from the website.'
      : r.background ? 'Paired. iOS will wake HuskyHealth when a workout is saved.'
      : 'Paired. Background sync is unavailable here (turn on Background App Refresh); use Sync now.')
  }
  const syncNow = async () => {
    if (!HealthKit) return
    const r = await HealthKit.syncNow()
    setStatus(r.status === 204 ? `Sent ${r.workouts} workout${r.workouts === 1 ? '' : 's'} to the relay (encrypted there).`
      : r.status === 409 ? 'A drop is still waiting: open the website to collect it.'
      : r.status === 404 ? 'The relay forgot this pairing (it restarted). Turn convenience mode off and on in the website, then pair again.'
      : r.reason ?? `Relay answered ${r.status}.`)
  }
  const unpair = async () => { await HealthKit?.unpair(); setStatus('Off. Keys and pairing deleted from this phone.') }

  return (
    <ScrollView style={{ backgroundColor: C.base }} contentContainerStyle={{ padding: 20, paddingTop: 70, gap: 14 }}>
      <Pressable onPress={() => router.back()}><Text style={{ ...mono, color: C.foam }}>{'< back'}</Text></Pressable>
      <Text style={{ ...mono, color: C.iris, letterSpacing: 2 }}>[ CONVENIENCE MODE ]</Text>
      <Text style={{ ...mono, color: C.muted }}>
        Your workouts sync to HuskyHealth on the web automatically. What leaves this phone: each new workout with its type and heart rate, sent to your relay, which encrypts it to a key only your browser holds and keeps it in memory until collected (max 24 h). Nothing is stored on the Pi.
      </Text>
      <Text style={{ ...mono, fontSize: 18 }}>Status: {status}</Text>
      <TextInput value={code} onChangeText={setCode} placeholder="Paste pairing code from the website" placeholderTextColor={C.muted}
        autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ ...mono, borderWidth: 1, borderColor: C.muted, padding: 12 }} />
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Pressable onPress={pair} style={{ borderWidth: 1, borderColor: C.foam, padding: 12 }}><Text style={{ ...mono, color: C.foam }}>Pair</Text></Pressable>
        <Pressable onPress={syncNow} style={{ borderWidth: 1, borderColor: C.muted, padding: 12 }}><Text style={mono}>Sync now</Text></Pressable>
        <Pressable onPress={unpair} style={{ borderWidth: 1, borderColor: C.love, padding: 12 }}><Text style={{ ...mono, color: C.love }}>Turn off</Text></Pressable>
      </View>
    </ScrollView>
  )
}
