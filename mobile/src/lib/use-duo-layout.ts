import { useEffect, useState } from 'react'
import { useWindowDimensions } from 'react-native'

import { DuoDisplay, type DuoState, type ReservedRegion } from '../../modules/duo-display'

/**
 * How much room the app has, and where the fold is.
 *
 * On iPhone Duo (iOS 27.1) this follows Apple's signals: a regular
 * horizontal size class means the inner display, and the fold comes from
 * UIKit's reserved regions. Everywhere else (Android, older iOS, the module
 * missing) it falls back to window width, at Android's own medium-window
 * breakpoint of 600 dp, so a Pixel Fold or Galaxy Fold opened flat gets the
 * same two-pane layout. A phone in portrait is never that wide, so phones
 * keep their layout exactly as before.
 *
 * Never lay out by orientation or device model: the inner display ignores
 * the app's portrait lock (Apple, iPhone Duo Group Labs). The fold's own
 * shape says which way the device is held instead: a fold running top to
 * bottom means landscape, one running across means portrait.
 *
 * Three modes (Ved, 19 Oct):
 * - columns: the fold runs top to bottom. Two panes side by side, split on
 *   it, half open or flat (an unfolded book).
 * - rows: the fold runs across and the hinge is part open. Two panes, one
 *   above the other, split on it (a laptop: the top half stands up to be
 *   read, the bottom half lies flat under the thumbs).
 * - single: everything else, including the inner display flat in portrait,
 *   which reads as one tall phone. Phones and the cover display stay here.
 *
 * Rows is the one place layout follows the hinge, which Apple advises
 * against in general. It's deliberate: half folded in portrait, a split
 * across the crease is the only layout that doesn't put content on it.
 */

export type DuoMode = 'single' | 'columns' | 'rows'

export interface DuoLayout {
  mode: DuoMode
  /** Two panes, side by side (columns) or stacked (rows). */
  wide: boolean
  width: number
  height: number
  /**
   * Where to split two panes, in window points: the fold when there is one,
   * otherwise a proportion of the width. `gap` is the fold's own width, kept
   * empty so nothing sits on the crease.
   */
  split: { left: number; gap: number }
  /** For rows: where the top pane ends (the fold's top edge), and its height. */
  splitRows: { top: number; gap: number }
  /**
   * Top padding for the second pane's scroll. Beside the first pane it lines
   * up under that pane's masthead; below it, it just needs breathing room.
   */
  secondPaneTop: number
  /** The fold, if this display has one (active or not). */
  fold: ReservedRegion | null
  /** True when the device is partly folded, the fold a real crease. */
  creased: boolean
  /** Which kind of signal decided `wide`. */
  source: 'size-class' | 'width'
}

const FALLBACK_BREAKPOINT = 600

export function useDuoLayout(): DuoLayout {
  const { width, height } = useWindowDimensions()
  const [native, setNative] = useState<DuoState | null>(null)

  useEffect(() => {
    if (!DuoDisplay) return
    let alive = true
    DuoDisplay.getState()
      .then(s => {
        logState(s)
        if (alive) setNative(s)
      })
      .catch(() => {})
    const sub = DuoDisplay.addListener('onChange', s => {
      logState(s)
      if (alive) setNative(s)
    })
    return () => {
      alive = false
      sub.remove()
    }
  }, [])

  // The window resizing (folding, unfolding, Split View) is also when the
  // fold region can move, so re-read on every size change.
  useEffect(() => {
    if (!DuoDisplay) return
    let alive = true
    DuoDisplay.getState()
      .then(s => {
        logState(s)
        if (alive) setNative(s)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [width, height])

  return layoutFrom(native, width, height)
}

// Development only: what the display reports, once per change, so the
// layouts can be checked against the real fold and window (Metro's log).
let lastLogged = ''
function logState(state: DuoState) {
  if (!__DEV__) return
  const line = JSON.stringify(state)
  if (line === lastLogged) return
  lastLogged = line
  console.log('[duo]', line)
}

/** Pure, so it can be reasoned about (and tested) without a device. */
export function layoutFrom(native: DuoState | null, width: number, height: number): DuoLayout {
  const sizeClass = native?.available ? native.horizontalSizeClass : undefined
  const knowsSizeClass = sizeClass === 'compact' || sizeClass === 'regular'
  const wide = knowsSizeClass ? sizeClass === 'regular' : width >= FALLBACK_BREAKPOINT

  const division = native?.division ?? []
  // A vertical fold: a region much taller than it is wide, inside the window.
  const fold = division.find(r => r.height > r.width && r.x > 0 && r.x + r.width < width) ?? null
  // A horizontal fold: wider than tall, across the window (portrait).
  const foldAcross = division.find(r => r.width > r.height && r.y > 0 && r.y + r.height < height) ?? null
  const partOpen = native?.hinge?.status === 'partiallyOpen'
  // From the hinge, not the region's isActive: on the iPhone Duo simulator
  // (iOS 27.1) the division region reads isActive false while half open and
  // true when flat, the reverse of what the name suggests.
  const creased = (!!fold || !!foldAcross) && partOpen

  const mode: DuoMode = foldAcross
    ? partOpen
      ? 'rows'
      : 'single'
    : wide
      ? 'columns'
      : 'single'

  const split = fold
    ? { left: fold.x, gap: fold.width }
    : { left: Math.round(width * 0.42), gap: 0 }
  const splitRows = foldAcross
    ? { top: foldAcross.y, gap: foldAcross.height }
    : { top: Math.round(height / 2), gap: 0 }

  return {
    mode,
    wide: mode !== 'single',
    width,
    height,
    split,
    splitRows,
    secondPaneTop: mode === 'rows' ? 16 : 88,
    fold,
    creased,
    source: knowsSizeClass ? 'size-class' : 'width',
  }
}
