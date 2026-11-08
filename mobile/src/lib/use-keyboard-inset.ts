import { useEffect, useState } from 'react'
import { Keyboard, Platform, useWindowDimensions } from 'react-native'

/**
 * How much of the screen the Android keyboard covers, in points; 0 on iOS.
 *
 * Expo SDK 58 draws Android edge to edge, so the window no longer shrinks
 * when the keyboard opens and a ScrollView never learns it's covered: the
 * sign-in button and the room form's name fields ended up under the keyboard.
 * Screens pad their scroll content by this much so the covered part can
 * scroll clear. iOS needs none of this (automaticallyAdjustKeyboardInsets and
 * KeyboardAvoidingView handle it there).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const show = Keyboard.addListener('keyboardDidShow', e => setInset(e.endCoordinates.height))
    const hide = Keyboard.addListener('keyboardDidHide', () => setInset(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return inset
}

/**
 * The on-screen keyboard's frame, on both platforms: whether it's up, and
 * how many points of the window it covers from the bottom.
 *
 * Layout uses this where scrolling isn't enough. Half folded in portrait,
 * iPhone Duo's keyboard opens over the bottom half, which is exactly where
 * the text fields are (TwoPane moves them above it). A hardware keyboard
 * reports no frame, so with one attached nothing moves.
 */
export function useKeyboardFrame(): { visible: boolean; covers: number } {
  const { height: windowHeight } = useWindowDimensions()
  const [screenY, setScreenY] = useState<number | null>(null)

  useEffect(() => {
    // iOS announces the frame before animating; Android only after.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, e => {
      if (__DEV__) console.log('[keyboard]', JSON.stringify(e.endCoordinates))
      setScreenY(e.endCoordinates.screenY)
    })
    const hide = Keyboard.addListener(hideEvent, () => setScreenY(null))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  const covers = screenY == null ? 0 : Math.max(0, windowHeight - screenY)
  return { visible: covers > 0, covers }
}
