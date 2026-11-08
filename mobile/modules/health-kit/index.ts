import { requireOptionalNativeModule } from 'expo'

/**
 * HuskyHealth's HealthKit module (ios/HuskyHealthKitModule.swift + HealthCore.swift).
 * iOS only; null elsewhere. Reads workouts (with their real types) and heart rate on the phone;
 * the only thing that ever leaves is the convenience-mode drop to the paired relay.
 */

export interface HKWorkoutRow {
  type: string
  sport: 'squash' | 'running' | 'walking' | 'cycling' | 'strength' | 'hiit' | 'other'
  start: number
  end: number
  min: number
  kcal: number | null
  device: string
  sourceName: string
}

export type SampleKind = 'hr' | 'rhr' | 'hrv' | 'vo2' | 'effort' | 'effortEst'

export interface SyncResult {
  status: number
  workouts: number
  reason?: string
}

interface HuskyHealthKitNative {
  isAvailable(): boolean
  requestAuthorization(): Promise<boolean>
  getWorkouts(days: number): Promise<HKWorkoutRow[]>
  getSamples(kind: SampleKind, startMs: number, endMs: number): Promise<[number, number][]>
  pair(relay: string, code: string): Promise<boolean>
  unpair(): Promise<void>
  isPaired(): boolean
  syncNow(): Promise<SyncResult>
  seedDemoWorkout(sport: string, minutes: number, endedMinutesAgo: number): Promise<boolean>
  historyAppend(line: string): void
  historyList(): string[]
  historyClear(): void
}

export const HealthKit = requireOptionalNativeModule<HuskyHealthKitNative>('HuskyHealthKit')
