// The website's dot-matrix palette (web/css/style.css): paper, ribbon ink, one Northeastern red, plus the same
// dark mapping the site uses under prefers-color-scheme: dark. Key names are roles the screens already use;
// zones map z1..z5 = foam, pine, gold, rose, love. The app follows the phone's appearance, like the website.
import { Appearance } from 'react-native'

const LIGHT = {
  base: '#f3efe3', surface: '#ebe5d3', text: '#1b1a17', muted: '#625e55', rule: '#cdc6b2',
  foam: '#49687a', pine: '#33694c', gold: '#785806', rose: '#b1430f', love: '#b00e28', iris: '#b00e28',
}
const DARK: typeof LIGHT = {
  base: '#16140f', surface: '#1c1a14', text: '#ece6d6', muted: '#9a9382', rule: '#3a362c',
  foam: '#8fb3c4', pine: '#86c29d', gold: '#d9ab43', rose: '#f0904f', love: '#ff5a6b', iris: '#ff5a6b',
}

export type Scheme = 'light' | 'dark'
// Screens read C and mono while they render; applyScheme swaps the values in place and the layout redraws them.
export const C = { ...(Appearance.getColorScheme() === 'dark' ? DARK : LIGHT) }
export const mono = { fontFamily: 'Menlo', color: C.text }
export function applyScheme(scheme: Scheme) {
  Object.assign(C, scheme === 'dark' ? DARK : LIGHT)
  mono.color = C.text
}
export const RELAY = 'https://veds-pi5.polecat-nominal.ts.net:10000'
