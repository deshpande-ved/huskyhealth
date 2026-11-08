import { useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { TwoPane } from '../components/two-pane'
import { useDuoLayout } from '../lib/use-duo-layout'

import { HealthKit } from '../../modules/health-kit'
import { C, mono, RELAY } from '../lib/theme'

// Your HuskyHealth account on this device. Log in once: the keys are derived here (the password never leaves the
// phone), and the phone keeps only a write token. When the Watch saves a workout, iOS wakes the app and it posts
// the workout to your personal API, where it is encrypted to your account's key on arrival.
const SAY: Record<number, string> = {
  0: 'Could not reach the relay.', 401: 'Wrong username or password.', 409: 'Ten devices is the limit: revoke one on the website.',
  422: 'Enter your username and password.', 429: 'Too many log-in attempts for this account. Wait a few minutes.',
}

export default function Account() {
  const [user, setUser] = useState<string | null>(HealthKit?.user() ?? null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const latest = useRef({ username: '', password: '' })     // the return key can fire before the last keystroke re-renders
  const [status, setStatus] = useState(user ? `Logged in as ${user}. New workouts sync automatically.` : 'Not logged in. Nothing leaves this device.')
  const [busy, setBusy] = useState(false)
  const inset = useSafeAreaInsets()
  const layout = useDuoLayout()

  const login = async () => {
    if (!HealthKit || busy) return
    setBusy(true)
    setStatus('Making your key and logging in…')
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
      : r.status === 401 ? 'This device\'s token expired or was revoked. Log in again.'
      : r.status === 429 ? 'The relay asked this device to slow down. It will try again on the next sync.'
      : r.status === 409 ? 'Log in on the website once so your account gets its key.'
      : r.reason ?? `The relay answered ${r.status}.`)
  }
  // Account deletion, as on the website: the relay deletes your vault, records and tokens for every device.
  const deleteAccount = () => {
    if (!HealthKit || !user) return
    Alert.prompt('Delete your account?', 'Your encrypted history and records are deleted for every device, and this cannot be undone. Enter your password to confirm.',
      [{ text: 'Cancel', style: 'cancel' },
       { text: 'Delete', style: 'destructive', onPress: async (pw?: string) => {
         setStatus('Deleting your account…')
         const st = HealthKit ? await HealthKit.deleteAccount(RELAY, user, pw ?? '') : 0
         if (st === 204) { setUser(null); setStatus('Account deleted. Nothing of it is left on the relay or this device.') }
         else setStatus(st === 401 ? 'Wrong password. Your account is unchanged.' : `The relay answered ${st}. Your account is unchanged.`)
       } }], 'secure-text')
  }
  const logout = async () => { await HealthKit?.unpair(); setUser(null); setStatus('Logged out. The device token is deleted.') }

  const btn = { borderWidth: 1, borderColor: C.text, paddingVertical: 10, paddingHorizontal: 14 } as const
  const about = (
    <View style={{ gap: 14 }}>
      <Pressable onPress={() => router.back()}><Text style={{ ...mono, color: C.muted, fontSize: 13 }}>{'\u2190 today'}</Text></Pressable>
      <Text style={{ ...mono, fontSize: 24, fontWeight: '700' }}>Account</Text>
      <Text style={{ ...mono, color: C.muted, fontSize: 13, lineHeight: 19 }}>
        Log in once and new workouts from your Apple Watch or Garmin go to your personal API by themselves: type, minutes, heart rate, calories, effort. Each one is encrypted to your account's key the moment it arrives; only you can read them.
      </Text>
      <Text style={{ ...mono, fontSize: 15, lineHeight: 21 }}>{status}</Text>
    </View>
  )
  const form = (
    <View style={{ gap: 12 }}>
      {!user ? (
        <>
          <TextInput value={username} onChangeText={(t) => { latest.current.username = t; setUsername(t) }} placeholder="username" placeholderTextColor={C.muted}
            autoCapitalize="none" autoCorrect={false} textContentType="username" style={{ ...mono, borderWidth: 1, borderColor: C.text, padding: 12 }} />
          <TextInput value={password} onChangeText={(t) => { latest.current.password = t; setPassword(t) }} placeholder="password" placeholderTextColor={C.muted}
            secureTextEntry textContentType="password" onSubmitEditing={login} style={{ ...mono, borderWidth: 1, borderColor: C.text, padding: 12 }} />
        </>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {!user ? <Pressable onPress={login} style={{ ...btn, backgroundColor: C.text }}><Text style={{ ...mono, color: C.base }}>{busy ? 'logging in…' : 'log in'}</Text></Pressable> : null}
        <Pressable onPress={syncNow} style={btn}><Text style={mono}>sync now</Text></Pressable>
        <Pressable onPress={logout} style={btn}><Text style={mono}>log out</Text></Pressable>
        {user ? <Pressable onPress={deleteAccount} style={{ ...btn, borderColor: C.love }}><Text style={{ ...mono, color: C.love }}>delete account</Text></Pressable> : null}
      </View>
    </View>
  )

  if (layout.wide) {
    // Side by side: what this is on the left, the fields on the right. Half folded: read on top, type below;
    // when the keyboard opens, the fields lift above the crease (TwoPane, typing="second").
    return (
      <View style={{ flex: 1, backgroundColor: C.base, paddingTop: inset.top, paddingLeft: inset.left }}>
        <TwoPane layout={layout} typing="second"
          left={<ScrollView contentContainerStyle={{ padding: 20, paddingRight: 20 }}>{about}</ScrollView>}
          right={<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingRight: 20 + inset.right, paddingTop: layout.mode === 'rows' ? 12 : 20 + 70 }}>{form}</ScrollView>}
        />
      </View>
    )
  }

  return (
    <ScrollView style={{ backgroundColor: C.base }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, paddingTop: inset.top + 16, paddingRight: 20 + inset.right, gap: 18 }}>
      {about}
      {form}
    </ScrollView>
  )
}
