import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import { View, useColorScheme } from 'react-native'

import { applyScheme, C, FONTS } from '../lib/theme'

export default function Layout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  applyScheme(scheme)
  const [fonts] = useFonts(FONTS)                       // Space Mono, the website's one face
  if (!fonts) return <View style={{ flex: 1, backgroundColor: C.base }} />
  // Keyed on the scheme so every screen redraws with the new palette when the phone switches appearance.
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack key={scheme} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.base } }} />
    </>
  )
}
