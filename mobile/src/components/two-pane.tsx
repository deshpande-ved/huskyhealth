// From Colère Nu (Ved's app): two panes split on the iPhone Duo's fold. Only the theme import differs.
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { C } from '../lib/theme'
import type { DuoLayout } from '../lib/use-duo-layout'
import { useKeyboardFrame } from '../lib/use-keyboard-inset'

/**
 * Two panes, split on the fold.
 *
 * - columns (fold top to bottom): `first` on the left, `second` on the right.
 * - rows (fold across, half open): `first` on top, `second` underneath.
 *   The top half stands up and is read; the bottom half lies flat under the
 *   thumbs, so screens put what's read in `first` and what's tapped in
 *   `second`. `swapInRows` flips that for a screen whose tappable part is
 *   its first pane (Events: the list goes underneath, the open room on top).
 *
 * The split is in window points (the fold's own frame, from UIKit's
 * reserved regions), and this sits inside a SafeAreaView that already pads
 * by the left and top insets, so those come off the first pane. The fold's
 * own width or height stays empty, so nothing sits on the crease; without a
 * fold, a hairline divides the panes instead.
 *
 * The on-screen keyboard (rows only): it opens over the bottom half, which
 * is where text fields go. So while it's up, the pane holding the fields
 * (`typing`) moves to the top half and the other pane steps aside: the
 * field stands up above the crease and the keyboard lies flat below it, the
 * way a laptop works. When the keyboard goes, the panes return. Side by side
 * (columns) nothing moves; each pane scrolls its own field clear instead.
 *
 * Only for `layout.wide`. Otherwise screens keep their single column.
 */
export function TwoPane({
  layout,
  left,
  right,
  swapInRows = false,
  typing,
}: {
  layout: DuoLayout
  /** The first pane: left in columns, top in rows. */
  left: React.ReactNode
  /** The second pane: right in columns, bottom in rows. */
  right: React.ReactNode
  swapInRows?: boolean
  /** Which pane holds the text fields, if any. */
  typing?: 'first' | 'second'
}) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const keyboard = useKeyboardFrame()

  if (layout.mode === 'rows') {
    const [top, bottom] = swapInRows ? [right, left] : [left, right]
    // The fields are in the bottom pane and the keyboard is over it.
    const lift = keyboard.visible && !!typing && (typing === 'second') !== swapInRows
    const topHeight = Math.max(MIN_ROW, layout.splitRows.top - insets.top)
    // Above the crease and above the keyboard, whichever is higher, so the
    // fields never sit on the fold.
    const liftedHeight = Math.max(MIN_ROW / 2, Math.min(layout.splitRows.top, windowHeight - keyboard.covers) - insets.top)
    // The same tree either way, only sizes change: re-parenting the pane
    // would remount its text field, drop focus, close the keyboard and
    // flip the panes straight back.
    return (
      <View style={styles.flex}>
        <View style={lift ? styles.collapsed : { height: topHeight }}>{top}</View>
        {lift ? null : layout.splitRows.gap > 0 ? <View style={{ height: layout.splitRows.gap }} /> : <View style={styles.rule} />}
        <View style={lift ? { height: liftedHeight } : styles.flex}>{bottom}</View>
      </View>
    )
  }

  const leftWidth = Math.max(MIN_PANE, layout.split.left - insets.left)
  return (
    <View style={styles.row}>
      <View style={{ width: leftWidth }}>{left}</View>
      {layout.split.gap > 0 ? <View style={{ width: layout.split.gap }} /> : <View style={styles.divider} />}
      <View style={styles.flex}>{right}</View>
    </View>
  )
}

/** Neither pane goes narrower than a small phone's column. */
const MIN_PANE = 320
/** Nor shorter than room for a heading and a few lines. */
const MIN_ROW = 240

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  flex: { flex: 1 },
  divider: { width: 1, backgroundColor: C.rule },
  rule: { height: 1, backgroundColor: C.rule },
  collapsed: { height: 0, overflow: 'hidden' },
})
