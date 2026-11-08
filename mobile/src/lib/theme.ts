// The website's dot-matrix palette and type (web/css/style.css): paper, bands, ribbon ink, one Northeastern red,
// Space Mono, and the same dark mapping the site uses under prefers-color-scheme: dark. Role names map to the
// site's tokens: base=--paper, surface=--band, text=--ink, text2=--ink-2, muted=--ink-3, rule=--rule,
// zones z1..z5 = foam, pine, gold, rose, love. The app follows the phone's appearance, like the website.
import { Appearance } from 'react-native'

const LIGHT = {
  base: '#f3efe3', surface: '#ebe5d3', text: '#1b1a17', text2: '#4d4a42', muted: '#625e55', rule: '#cdc6b2',
  foam: '#16699e', pine: '#33694c', gold: '#785806', rose: '#b1430f', love: '#b00e28', iris: '#b00e28',
}
const DARK: typeof LIGHT = {
  base: '#16140f', surface: '#1c1a14', text: '#ece6d6', text2: '#bdb6a4', muted: '#9a9382', rule: '#3a362c',
  foam: '#7fd0ff', pine: '#86c29d', gold: '#d9ab43', rose: '#f0904f', love: '#ff5a6b', iris: '#ff5a6b',
}

export type Scheme = 'light' | 'dark'
// Screens read C, mono and bold while they render; applyScheme swaps the values in place and the layout redraws them.
export const C = { ...(Appearance.getColorScheme() === 'dark' ? DARK : LIGHT) }
export const FONTS = {
  SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
  'SpaceMono-Bold': require('../../assets/fonts/SpaceMono-Bold.ttf'),
}
export const mono = { fontFamily: 'SpaceMono', color: C.text }
export const bold = { fontFamily: 'SpaceMono-Bold', color: C.text }
/** One printed line (--line: 24px); the paper bands are three lines tall, as on the website. */
export const LINE = 24
export function applyScheme(scheme: Scheme) {
  Object.assign(C, scheme === 'dark' ? DARK : LIGHT)
  mono.color = C.text
  bold.color = C.text
}
// A phone has no hover, so links, commands and buttons always show their hover look, as on the website under
// @media (hover: none): links and commands red; the method (source) link never red: grey with a dotted underline;
// boxed buttons filled (ink, or red for the main and destructive ones).
export const link = () => ({ fontFamily: 'SpaceMono', color: C.love, textDecorationLine: 'underline' as const, textDecorationColor: C.love })
export const methodLink = () => ({ fontFamily: 'SpaceMono', color: C.muted, textDecorationLine: 'underline' as const, textDecorationStyle: 'dotted' as const, textDecorationColor: C.muted })
export const filled = (kind: 'plain' | 'primary' | 'danger' = 'plain') => ({
  box: { borderWidth: 1, borderColor: kind === 'plain' ? C.text : C.love, backgroundColor: kind === 'plain' ? C.text : C.love, paddingVertical: 10, paddingHorizontal: 14 },
  text: { fontFamily: 'SpaceMono', fontSize: 13, color: C.base },
})

export const RELAY = 'https://veds-pi5.polecat-nominal.ts.net:10000'
export const SITE = 'https://huskyhealth.pages.dev'
