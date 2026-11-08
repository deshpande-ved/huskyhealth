// Today: the website's today page (web/index.html #today, web/js/app.js render()), piece for piece, drawn from the
// same account vault with the same code: masthead, the call in block letters, reason, basis, listen, ask your API,
// method, then the rows. Copy, numbers and layout match the website; only the Duo's two-pane postures are extra.
import { useCallback, useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { openBrowserAsync } from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Mark } from '../components/mark'
import { PaperScroll } from '../components/paper'
import { TwoPane } from '../components/two-pane'
import { useDuoLayout } from '../lib/use-duo-layout'
import { HealthKit } from '../../modules/health-kit'
import { loadToday, type Today as TodayData } from '../lib/today'
import { C, bold, mono, RELAY, SITE } from '../lib/theme'
import { todayModel, dateLabel, briefText, answerQuestion, weekDetail, sessionDetail, zoneDetail, WELCOME } from '../../../web/js/view.js'
import { banner } from '../../../web/js/ascii.js'

type Cell = { ch: string; cls: string }
type Fig = { id: string; title?: string; summary?: string; label: string; rows: Cell[][] }
type Word = { text: string; start_s?: number; stop_s?: number }

const zone = (cls: string) => (({ z0: C.muted, muted: C.muted, z1: C.foam, z2: C.pine, z3: C.gold, z4: C.rose, z5: C.love, alert: C.love }) as Record<string, string>)[cls] ?? C.text

const button = { borderWidth: 1, borderColor: C.text, paddingVertical: 10, paddingHorizontal: 14 } as const
function Button({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ ...button, borderColor: C.text, backgroundColor: primary ? C.text : 'transparent' }}>
      <Text style={{ ...mono, fontSize: 14, color: primary ? C.base : C.text }}>{label}</Text>
    </Pressable>
  )
}

// A row of the printout (web: a.row): title, one plain sentence, the ASCII figure. Dashed rule under each.
function Row({ fig }: { fig: Fig }) {
  return (
    <View style={{ borderBottomWidth: 1, borderColor: C.rule, borderStyle: 'dashed', paddingVertical: 24, paddingHorizontal: 8, gap: 8 }}>
      <View>
        <Text style={{ ...bold, fontSize: 20 }}>{fig.title}</Text>
        <Text style={{ ...mono, color: C.text2, fontSize: 14, lineHeight: 21, marginTop: 4 }}>{fig.summary || fig.label}</Text>
      </View>
      {fig.rows?.length ? (
        <View accessible accessibilityRole="image" accessibilityLabel={fig.label}>
          {fig.rows.map((row, r) => (
            <Text key={r} style={{ fontFamily: 'SpaceMono', fontSize: 12.8, lineHeight: 19 }}>
              {row.map((c, i) => <Text key={i} style={{ color: zone(c.cls) }}>{c.ch}</Text>)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}

// The call in block letters (web: .banner), sized to fit the column like the website's min(20px, width / cols*0.62).
function Banner({ words, width }: { words: string[]; width: number }) {
  let blocks: string[][]
  try { blocks = words.map((w) => banner(w.toUpperCase())) }
  catch { return <Text style={{ ...bold, color: C.love, fontSize: 28, marginBottom: 24 }}>{words.join(' ')}</Text> }   // a character the font lacks
  const cols = Math.max(...blocks.flat().map((l) => l.length))
  const size = Math.min(20, width / (cols * 0.62))
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={words.join(' ')} style={{ marginBottom: 24, gap: size }}>
      {blocks.map((lines, i) => (
        <Text key={i} style={{ fontFamily: 'SpaceMono-Bold', color: C.love, fontSize: size, lineHeight: size }}>{lines.join('\n')}</Text>
      ))}
    </View>
  )
}

function Masthead({ user }: { user: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 24, paddingBottom: 16, borderBottomWidth: 1, borderColor: C.text }}>
      <Pressable onPress={() => router.replace('/')} accessibilityLabel="HuskyHealth, today"><Mark size={52} /></Pressable>
      <View style={{ flex: 1, gap: 8 }}>
        <View>
          <Text style={{ ...bold, fontSize: 24, lineHeight: 27 }}>HuskyHealth</Text>
          <Text style={{ ...mono, color: C.text2, fontSize: 14, marginTop: 2 }}>Your workouts, as an API only you can read.</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 24 }}>
          <Text style={{ ...mono, fontSize: 14, color: C.text, textDecorationLine: 'underline', textDecorationColor: C.love }}>
            <Text style={{ color: C.muted }}>./</Text>today
          </Text>
          <Text onPress={() => openBrowserAsync(`${SITE}/api`)} style={{ ...mono, fontSize: 14, color: C.text2 }}>
            <Text style={{ color: C.muted }}>./</Text>api
          </Text>
        </View>
      </View>
      <Text onPress={() => router.push('/sync')} style={{ ...mono, fontSize: 14, alignSelf: 'flex-start', textDecorationLine: user ? 'underline' : 'none', textDecorationColor: C.love }}>
        {user ?? 'log in'}
      </Text>
    </View>
  )
}

export default function Today() {
  const [user, setUser] = useState<string | null>(HealthKit?.user() ?? null)
  const [data, setData] = useState<TodayData | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [caption, setCaption] = useState<{ words: Word[]; on: number } | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState<{ heard: string; curl: string } | null>(null)
  const [listening, setListening] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const micOk = useRef(false)

  const read = useCallback(async () => {
    const u = HealthKit?.user() ?? null
    setUser(u)
    if (!u) { setData(null); return }
    setBusy(true)
    setStatus('Reading Apple Health and your history…')
    try {
      const t = await loadToday()
      setData(t)
      setStatus(t.saved === 204 ? '' : `Your history could not be saved (${t.saved}); showing it anyway.`)
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { read() }, [read]))   // back from the account screen: log in, log out, sync

  const stopSpeaking = () => {
    HealthKit?.stopSpeaking()
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setSpeaking(false)
    setCaption((c) => (c ? { ...c, on: -1 } : null))
  }

  // listen (web: playBrief): Gradium speaks it; the words light up as they are said.
  const speak = async (text: string) => {
    if (speaking) return stopSpeaking()
    if (!HealthKit) return
    setSpeaking(true)
    const r = await HealthKit.speak(text)
    if (r.status !== 200 || !r.words?.length) {
      setSpeaking(false)
      setCaption({ words: text.split(/\s+/).map((w) => ({ text: w })), on: -1 })
      if (r.status === 503) setStatus('Speech is not set up on the relay.')
      else if (r.status !== 200) setStatus(`Could not speak it (${r.status}).`)
      return
    }
    const words = r.words
    const t0 = Date.now()
    setCaption({ words, on: 0 })
    timer.current = setInterval(() => {
      const t = (Date.now() - t0) / 1000
      if (t > (words[words.length - 1].stop_s ?? 0) + 0.3) return stopSpeaking()
      setCaption({ words, on: words.findIndex((w) => t >= (w.start_s ?? 0) && t < (w.stop_s ?? 0) + 0.05) })
    }, 60)
  }

  const f = data?.features
  const an = data?.analysis
  const m = f && an ? todayModel(an, f) : null
  const figs = (m ? [m.week, m.last, m.sleep, m.fitness, m.zones].filter(Boolean) : []) as Fig[]

  // ask your API (web: askNode): keyword intents answered from the page's data, spoken, with the curl behind them
  const answer = (q: string) => {
    if (!m || !f || !an) return
    const r = answerQuestion(q, { model: m, week: weekDetail(an, f), session: sessionDetail(an, f), zones: zoneDetail(f), features: f, relay: RELAY })
    setAsked({ heard: `You asked: ${q}`, curl: r.curl })
    if (speaking) stopSpeaking()
    speak(r.answer)
  }
  const askByVoice = async () => {
    if (!HealthKit || listening) return
    if (!micOk.current) {
      const go = await new Promise<boolean>((done) => Alert.alert('Ask out loud?',
        'Your spoken question (at most 5 seconds) goes to Gradium through the relay to become text. Nothing is stored. Continue?',
        [{ text: 'Cancel', style: 'cancel', onPress: () => done(false) }, { text: 'Continue', onPress: () => done(true) }]))
      if (!go) return
      micOk.current = true
    }
    setListening(true)
    setAsked({ heard: 'Listening…', curl: '' })
    const r = await HealthKit.listen()
    setListening(false)
    if (r.status === 403) return setAsked({ heard: 'No microphone access. Type your question instead.', curl: '' })
    if (r.status !== 200 || !r.text) return setAsked({ heard: r.status === 503 ? 'Speech is not set up on the relay. Type it instead.' : 'Did not catch that. Try again or type it.', curl: '' })
    setQuestion(r.text)
    answer(r.text)
  }

  const { width } = useWindowDimensions()
  const inset = useSafeAreaInsets()
  const layout = useDuoLayout()
  const side = 16

  const hero = (bannerWidth: number) => m ? (
    <View style={{ paddingTop: 48, paddingBottom: 32 }}>
      <Banner words={[m.call.headline]} width={bannerWidth} />
      <Text style={{ ...mono, fontSize: 20, lineHeight: 29 }}>{m.call.reason}</Text>
      <Text style={{ ...mono, color: C.text2, fontSize: 14, marginTop: 12 }}>{`${dateLabel(0)}, ${m.call.basis}.`}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', marginTop: 24 }}>
        <Button label={speaking ? 'stop' : 'listen'} onPress={() => speak(briefText({ call: m.call, week: m.week, last: m.last, sleep: m.sleep }))} />
        {caption ? (
          <Text style={{ ...mono, flex: 1, minWidth: 200, fontSize: 14, color: C.text2 }}>
            {caption.words.map((w, i) => (
              <Text key={i} style={i === caption.on ? { color: C.base, backgroundColor: C.love } : null}>{`${w.text} `}</Text>
            ))}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
        <TextInput value={question} onChangeText={setQuestion} placeholder="how was my week?" placeholderTextColor={C.muted}
          accessibilityLabel="Ask your API" autoCapitalize="none" returnKeyType="send"
          onSubmitEditing={() => question.trim() && answer(question.trim())}
          style={{ ...mono, flex: 1, minWidth: 0, fontSize: 15, borderWidth: 1, borderColor: C.text, paddingHorizontal: 12, paddingVertical: 10 }} />
        <Button label="ask" primary onPress={() => question.trim() && answer(question.trim())} />
        <Button label={listening ? '…' : 'speak'} onPress={askByVoice} />
      </View>
      {asked ? <Text style={{ ...mono, color: C.text2, fontSize: 14, marginTop: 12 }}>{asked.heard}</Text> : null}
      {asked?.curl ? (
        <Text selectable style={{ fontFamily: 'SpaceMono', fontSize: 12.8, lineHeight: 19, color: C.text, borderWidth: 1, borderColor: C.rule, padding: 12, marginTop: 8 }}>{asked.curl}</Text>
      ) : null}
      <Text onPress={() => openBrowserAsync(`${SITE}/#${m.call.ref}`)} style={{ ...mono, color: C.muted, fontSize: 12.8, marginTop: 8, textDecorationLine: 'underline', textDecorationColor: C.love }}>
        {`method · ${m.call.source.citation} · ${m.call.source.status}`}
      </Text>
      {status ? <Text style={{ ...mono, color: C.text2, fontSize: 14, marginTop: 12 }}>{status}</Text> : null}
    </View>
  ) : (
    <View style={{ paddingTop: 48, paddingBottom: 32 }}>
      <Banner words={['HUSKY', 'HEALTH']} width={bannerWidth} />
      {user ? <Text style={{ ...mono, color: C.text2, fontSize: 14 }}>{status}</Text> : (
        <>
          <Text style={{ ...mono, fontSize: 20, lineHeight: 29 }}>{WELCOME}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 24 }}>
            <Button label="log in" primary onPress={() => router.push('/sync')} />
            <Text onPress={() => openBrowserAsync(`${SITE}/api`)} style={{ ...mono, fontSize: 14, textDecorationLine: 'underline', textDecorationColor: C.love }}>how the API works</Text>
          </View>
        </>
      )}
    </View>
  )
  const rows = figs.length ? <View style={{ borderTopWidth: 1, borderColor: C.text }}>{figs.map((fig) => <Row key={fig.id} fig={fig} />)}</View> : null
  const refresh = <RefreshControl refreshing={busy} onRefresh={read} tintColor={C.muted} />

  if (layout.wide) {
    // Unfolded (columns): the masthead and the call on the left, the rows on the right. Half folded (rows): the
    // call stands up on the top half to be read, the rows lie flat on the bottom half. Nothing sits on the crease.
    const isRows = layout.mode === 'rows'
    const leftWidth = (isRows ? width - inset.left - inset.right : Math.max(320, layout.split.left - inset.left)) - 2 * side
    return (
      <View style={{ flex: 1, backgroundColor: C.base, paddingTop: inset.top, paddingLeft: inset.left }}>
        <TwoPane layout={layout}
          left={<PaperScroll refreshControl={refresh} contentContainerStyle={{ paddingHorizontal: side, paddingBottom: 24 }}><Masthead user={user} />{hero(leftWidth)}</PaperScroll>}
          right={<PaperScroll contentContainerStyle={{ paddingHorizontal: side, paddingRight: side + inset.right, paddingTop: isRows ? 12 : 24, paddingBottom: 40 + inset.bottom }}>{rows}</PaperScroll>}
        />
      </View>
    )
  }

  return (
    <PaperScroll refreshControl={refresh}
      contentContainerStyle={{ paddingLeft: side + inset.left, paddingRight: side + inset.right, paddingTop: inset.top, paddingBottom: 60 + inset.bottom }}>
      <Masthead user={user} />
      {hero(width - inset.left - inset.right - 2 * side)}
      {rows}
    </PaperScroll>
  )
}
