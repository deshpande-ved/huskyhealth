import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { openBrowserAsync } from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PaperScroll } from '../components/paper'
import { TwoPane } from '../components/two-pane'
import { useDuoLayout } from '../lib/use-duo-layout'

import { HealthKit } from '../../modules/health-kit'
import { bold, C, mono, RELAY, SITE } from '../lib/theme'

// Your HuskyHealth account, as on the website's account page. Log in once: the keys are derived here (the password
// is never sent), new workouts from your watch go to your personal API by themselves, and History lists the reports
// saved in your encrypted vault, the same list the website shows.
const SAY: Record<number, string> = {
  0: 'Could not reach the relay.', 401: 'Wrong username or password.', 409: 'Ten devices is the limit: revoke one on the website.',
  422: 'Enter your username and password.', 429: 'Too many log-in attempts for this account. Wait a few minutes.',
}

type Report = { at: string; call: string; fitness: number; fatigue: number; form: number; workouts: number; minutes: number; source: string }
const fmtAt = (iso: string) => iso.slice(0, 16).replace('T', ' ')

export default function Account() {
  const [user, setUser] = useState<string | null>(HealthKit?.user() ?? null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const latest = useRef({ username: '', password: '' })     // the return key can fire before the last keystroke re-renders
  const [status, setStatus] = useState(user ? 'New workouts sync automatically.' : '')
  const [busy, setBusy] = useState(false)
  const [reports, setReports] = useState<Report[] | null>(null)
  const inset = useSafeAreaInsets()
  const layout = useDuoLayout()

  const loadReports = useCallback(async () => {
    if (!HealthKit || !HealthKit.user()) return setReports(null)
    const r = await HealthKit.getVault()
    if (r.status !== 200) return setReports([])
    try { setReports(r.vault ? ((JSON.parse(r.vault).reports ?? []) as Report[]) : []) } catch { setReports([]) }
  }, [])
  useEffect(() => { loadReports() }, [loadReports, user])

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
    const bg = r.background ? 'New workouts sync automatically.' : 'Background sync is off (turn on Background App Refresh); use sync now.'
    setStatus(b.status === 409 ? 'Logged in. Log in on the website once so your account gets its key, then tap sync now.'
      : `Sent ${b.workouts} of ${b.total} workouts from the last 60 days. ${bg}`)
  }
  const syncNow = async () => {
    if (!HealthKit) return
    const r = await HealthKit.syncNow()
    setStatus(r.status === 201 ? `Sent ${r.workouts} workout${r.workouts === 1 ? '' : 's'} to your API (encrypted on arrival).`
      : r.status === 401 ? 'The device token expired or was revoked. Log in again.'
      : r.status === 429 ? 'The relay asked to slow down. It will try again on the next sync.'
      : r.status === 409 ? 'Log in on the website once so your account gets its key.'
      : r.reason ?? `The relay answered ${r.status}.`)
    loadReports()
  }
  // Kept for the hackathon demo: adds a 45-minute squash session to Apple Health, then sends it.
  const seed = async () => {
    if (!HealthKit) return
    setStatus('Adding a demo squash session to Apple Health…')
    try {
      await HealthKit.requestAuthorization()
      const ok = await HealthKit.seedDemoWorkout('squash', 45, 15)
      if (!ok) return setStatus('Apple Health did not save the demo workout.')
      await syncNow()
    } catch (e) {
      setStatus(`Demo workout failed: ${(e as Error).message}`)
    }
  }
  // Account deletion, as on the website: the relay deletes your vault, records and tokens for every device.
  const deleteAccount = () => {
    if (!HealthKit || !user) return
    Alert.prompt('Delete your account?', 'Your encrypted history and records are deleted for every device, and this cannot be undone. Enter your password to confirm.',
      [{ text: 'Cancel', style: 'cancel' },
       { text: 'Delete', style: 'destructive', onPress: async (pw?: string) => {
         setStatus('Deleting your account…')
         const st = HealthKit ? await HealthKit.deleteAccount(RELAY, user, pw ?? '') : 0
         if (st === 204) { setUser(null); setStatus('Account deleted. Nothing of it is left on the relay.') }
         else setStatus(st === 401 ? 'Wrong password. Your account is unchanged.' : `The relay answered ${st}. Your account is unchanged.`)
       } }], 'secure-text')
  }
  const logout = async () => { await HealthKit?.unpair(); setUser(null); setStatus('Logged out. The device token is deleted.') }

  const btn = { borderWidth: 1, borderColor: C.text, paddingVertical: 10, paddingHorizontal: 14 } as const
  const btnText = { ...mono, fontSize: 13 } as const
  const h3 = { ...bold, fontSize: 17, marginTop: 8 } as const

  const about = (
    <View style={{ gap: 14 }}>
      <Pressable onPress={() => router.back()}><Text style={{ ...mono, color: C.text2, fontSize: 13 }}>{'← today'}</Text></Pressable>
      <Text accessibilityRole="header" style={{ ...bold, fontSize: 20 }}>{user ? 'Account' : 'Log in'}</Text>
      {user ? <Text style={{ ...mono, fontSize: 15, lineHeight: 22 }}>Logged in as {user}.</Text> : null}
      {status ? <Text style={{ ...mono, color: C.text2, fontSize: 13, lineHeight: 19 }}>{status}</Text> : null}
      {user ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={h3}>History</Text>
          {reports === null ? <Text style={{ ...mono, color: C.muted, fontSize: 13 }}>…</Text>
            : reports.length === 0 ? <Text style={{ ...mono, color: C.muted, fontSize: 13 }}>No reports yet.</Text>
            : reports.slice(0, 20).map((r) => (
              <Text key={r.at} style={{ ...mono, color: C.text2, fontSize: 13, lineHeight: 19, borderBottomWidth: 1, borderColor: C.rule, borderStyle: 'dashed', paddingBottom: 6 }}>
                {`${fmtAt(r.at)} · ${r.call} · fitness ${r.fitness} · fatigue ${r.fatigue} · form ${r.form} · ${r.workouts} workouts, ${r.minutes} min · from ${r.source}`}
              </Text>
            ))}
        </View>
      ) : null}
    </View>
  )
  const form = (
    <View style={{ gap: 12 }}>
      {!user ? (
        <>
          <TextInput value={username} onChangeText={(t) => { latest.current.username = t; setUsername(t) }} placeholder="username" placeholderTextColor={C.muted}
            autoCapitalize="none" autoCorrect={false} textContentType="username" style={{ ...mono, fontSize: 15, borderWidth: 1, borderColor: C.text, padding: 12, backgroundColor: C.base }} />
          <TextInput value={password} onChangeText={(t) => { latest.current.password = t; setPassword(t) }} placeholder="password" placeholderTextColor={C.muted}
            secureTextEntry textContentType="password" onSubmitEditing={login} style={{ ...mono, fontSize: 15, borderWidth: 1, borderColor: C.text, padding: 12, backgroundColor: C.base }} />
        </>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {!user ? <Pressable onPress={login} style={{ ...btn, backgroundColor: C.text }}><Text style={{ ...btnText, color: C.base }}>{busy ? 'logging in…' : 'log in'}</Text></Pressable> : null}
        {user ? <Pressable onPress={syncNow} style={btn}><Text style={btnText}>sync now</Text></Pressable> : null}
        {user ? <Pressable onPress={seed} style={{ ...btn, borderColor: C.muted }}><Text style={{ ...btnText, color: C.muted }}>demo workout</Text></Pressable> : null}
        <Pressable onPress={() => openBrowserAsync(`${SITE}/api`)} style={btn}><Text style={btnText}>how the API works</Text></Pressable>
        {user ? <Pressable onPress={logout} style={btn}><Text style={btnText}>log out</Text></Pressable> : null}
        {user ? <Pressable onPress={deleteAccount} style={{ ...btn, borderColor: C.love }}><Text style={{ ...btnText, color: C.love }}>delete account</Text></Pressable> : null}
      </View>
      {!user ? (
        <Text style={{ ...mono, color: C.muted, fontSize: 13, lineHeight: 19 }}>
          There is no password reset: nobody can read your history, so a forgotten password loses it.
        </Text>
      ) : null}
    </View>
  )

  if (layout.wide) {
    // Side by side: the account on the left, the fields and actions on the right. Half folded: read on top, type
    // below; when the keyboard opens, the fields lift above the crease (TwoPane, typing="second").
    return (
      <View style={{ flex: 1, backgroundColor: C.base, paddingTop: inset.top, paddingLeft: inset.left }}>
        <TwoPane layout={layout} typing="second"
          left={<PaperScroll contentContainerStyle={{ padding: 20, paddingRight: 20 }}>{about}</PaperScroll>}
          right={<PaperScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingRight: 20 + inset.right, paddingTop: layout.mode === 'rows' ? 12 : 20 + 70 }}>{form}</PaperScroll>}
        />
      </View>
    )
  }

  return (
    <PaperScroll keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, paddingTop: inset.top + 16, paddingRight: 20 + inset.right, gap: 18 }}>
      {about}
      {form}
    </PaperScroll>
  )
}
