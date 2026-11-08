import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'

import { HealthKit } from '../../modules/health-kit'
import { C, mono, RELAY } from '../lib/theme'

// Your HuskyHealth account on this phone. Log in once: the keys are derived here (the password never leaves the
// phone), and the phone keeps only a write token. When the Watch saves a workout, iOS wakes the app and it posts
// the workout to your personal API, where it is encrypted to your account's key on arrival.
const SAY: Record<number, string> = {
  0: 'Could not reach the relay.', 401: 'Wrong username or password.', 409: 'Ten devices is the limit: revoke one on the website.',
  422: 'Enter your username and password.', 429: 'Too many tries. Wait a minute.',
}

export default function Account() {
  const [user, setUser] = useState<string | null>(HealthKit?.user() ?? null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const latest = useRef({ username: '', password: '' })     // the return key can fire before the last keystroke re-renders
  const [status, setStatus] = useState(user ? `Logged in as ${user}. New workouts sync automatically.` : 'Not logged in. Nothing leaves this phone.')
  const [busy, setBusy] = useState(false)

  const login = async () => {
    if (!HealthKit || busy) return
    setBusy(true)
    setStatus('Making your key on this phone and logging in…')
    await HealthKit.requestAuthorization()
    const r = await HealthKit.login(RELAY, latest.current.username, latest.current.password)
    latest.current.password = ''
    setPassword('')
    if (!r.ok) { setBusy(false); return setStatus(SAY[r.status] ?? `The relay answered ${r.status}.`) }
    setUser(HealthKit.user())
    // A new account gets its history without an export: the last 60 days, one encrypted record per workout.
    setStatus('Logged in. Sending your last 60 days of workouts to your API…')
    const b = await HealthKit.backfill(60)
    setBusy(false)
    const bg = r.background ? 'New workouts will sync automatically.' : 'Background sync is off here (turn on Background App Refresh); use Sync now.'
    setStatus(b.status === 409 ? 'Logged in. Log in on the website once so your account gets its key, then tap Sync now.'
      : `Logged in as ${latest.current.username.trim().toLowerCase()}. Sent ${b.workouts} of ${b.total} workouts from the last 60 days. ${bg}`)
  }
  const syncNow = async () => {
    if (!HealthKit) return
    const r = await HealthKit.syncNow()
    setStatus(r.status === 201 ? `Sent ${r.workouts} workout${r.workouts === 1 ? '' : 's'} to your API (encrypted on arrival).`
      : r.status === 401 ? 'This phone\'s token was revoked. Log in again.'
      : r.status === 409 ? 'Log in on the website once so your account gets its key.'
      : r.reason ?? `The relay answered ${r.status}.`)
  }
  const logout = async () => { await HealthKit?.unpair(); setUser(null); setStatus('Logged out. The token is deleted from this phone.') }

  return (
    <ScrollView style={{ backgroundColor: C.base }} contentContainerStyle={{ padding: 20, paddingTop: 70, gap: 14 }}>
      <Pressable onPress={() => router.back()}><Text style={{ ...mono, color: C.foam }}>{'< back'}</Text></Pressable>
      <Text style={{ ...mono, color: C.iris, letterSpacing: 2 }}>[ ACCOUNT ]</Text>
      <Text style={{ ...mono, color: C.muted }}>
        Log in to send new workouts to your personal API automatically: type, minutes, heart rate, Watch effort. The Pi encrypts each one to your account's key the moment it arrives and keeps only ciphertext. Only you can read them, on the website, after logging in.
      </Text>
      <Text style={{ ...mono, fontSize: 16 }}>{status}</Text>
      {!user ? (
        <>
          <TextInput value={username} onChangeText={(t) => { latest.current.username = t; setUsername(t) }} placeholder="username" placeholderTextColor={C.muted}
            autoCapitalize="none" autoCorrect={false} textContentType="username" style={{ ...mono, borderWidth: 1, borderColor: C.muted, padding: 12 }} />
          <TextInput value={password} onChangeText={(t) => { latest.current.password = t; setPassword(t) }} placeholder="password" placeholderTextColor={C.muted}
            secureTextEntry textContentType="password" onSubmitEditing={login} style={{ ...mono, borderWidth: 1, borderColor: C.muted, padding: 12 }} />
        </>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {!user ? <Pressable onPress={login} style={{ borderWidth: 1, borderColor: C.foam, padding: 12 }}><Text style={{ ...mono, color: C.foam }}>{busy ? 'Logging in…' : 'Log in'}</Text></Pressable> : null}
        <Pressable onPress={syncNow} style={{ borderWidth: 1, borderColor: C.muted, padding: 12 }}><Text style={mono}>Sync now</Text></Pressable>
        <Pressable onPress={logout} style={{ borderWidth: 1, borderColor: C.love, padding: 12 }}><Text style={{ ...mono, color: C.love }}>Log out</Text></Pressable>
      </View>
    </ScrollView>
  )
}
