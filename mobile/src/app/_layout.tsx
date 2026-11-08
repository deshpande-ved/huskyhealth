import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import { Pressable, Text, View, useColorScheme } from 'react-native'

import { applyScheme, C, FONTS, mono } from '../lib/theme'

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

// Any error while drawing a screen shows here, with a way back, instead of closing the app.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.base, padding: 24, paddingTop: 96, gap: 16 }}>
      <Text style={{ ...mono, fontSize: 20 }}>Something went wrong drawing this screen.</Text>
      <Text style={{ ...mono, color: C.text2, fontSize: 14 }}>{error.message}</Text>
      <Pressable onPress={retry} style={{ borderWidth: 1, borderColor: C.text, padding: 12, alignSelf: 'flex-start' }}>
        <Text style={{ ...mono, fontSize: 14 }}>try again</Text>
      </Pressable>
    </View>
  )
}
