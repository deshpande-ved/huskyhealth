import { requireOptionalNativeModule, type EventSubscription } from 'expo'

/**
 * The iPhone Duo display module (ios/DuoDisplayModule.swift).
 *
 * Optional on purpose: it's built for iOS only, so on Android this is null,
 * and on iOS before 27.1 it reports size classes without fold or bar data.
 * Use it through src/lib/use-duo-layout.ts, which handles both.
 */

export type SizeClass = 'compact' | 'regular' | 'unspecified'

export interface ReservedRegion {
  x: number
  y: number
  width: number
  height: number
  isActive: boolean
  margins: { top: number; left: number; bottom: number; right: number }
}

export interface DuoState {
  available: boolean
  horizontalSizeClass?: SizeClass
  verticalSizeClass?: SizeClass
  width?: number
  height?: number
  verticalBarEdge?: 'leading' | 'trailing' | 'unspecified'
  /** The fold. Present on iPhone Duo's inner display; check `isActive`. */
  division?: ReservedRegion[]
  /** The cameras. Keep interactive things out of these. */
  occlusion?: ReservedRegion[]
  /**
   * For effects only; Apple: never lay out by the hinge. `angle` is in
   * radians (π when flat), observed on the iPhone Duo simulator; UIHinge.h
   * doesn't state the unit.
   */
  hinge?: { status: 'closed' | 'partiallyOpen' | 'fullyOpen' | 'unknown'; angle: number }
}

interface DuoDisplayNative {
  getState(): Promise<DuoState>
  addListener(event: 'onChange', listener: (state: DuoState) => void): EventSubscription
}

export const DuoDisplay = requireOptionalNativeModule<DuoDisplayNative>('DuoDisplay')
