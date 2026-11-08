import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'react-native'

import { applyScheme, C } from '../lib/theme'

export default function Layout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  applyScheme(scheme)
  // Keyed on the scheme so every screen redraws with the new palette when the phone switches appearance.
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack key={scheme} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.base } }} />
    </>
  )
}
