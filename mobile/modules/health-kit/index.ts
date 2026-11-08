import { requireOptionalNativeModule } from 'expo'

/**
 * HuskyHealth's HealthKit module (ios/HuskyHealthKitModule.swift + HealthCore.swift).
 * iOS only; null elsewhere. Reads workouts (with their real types) and heart rate on the phone;
 * the only thing that ever leaves is a record POSTed to your own personal API (/v1/me/records).
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
  login(relay: string, username: string, password: string): Promise<{ ok: boolean; status: number; background: boolean }>
  user(): string | null
  unpair(): Promise<void>
  isPaired(): boolean
  syncNow(): Promise<SyncResult>
  backfill(days: number): Promise<{ status: number; workouts: number; total: number; daily?: number }>
  seedDemoWorkout(sport: string, minutes: number, endedMinutesAgo: number): Promise<boolean>
  historyAppend(line: string): void
  historyList(): string[]
  historyClear(): void
}

export const HealthKit = requireOptionalNativeModule<HuskyHealthKitNative>('HuskyHealthKit')
