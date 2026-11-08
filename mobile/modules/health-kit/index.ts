import { requireOptionalNativeModule } from 'expo'

/**
 * HuskyHealth's HealthKit module (ios/HuskyHealthKitModule.swift + HealthCore.swift).
 * iOS only; null elsewhere. Reads workouts (with their real types) and heart rate on the phone;
 * what leaves is a sealed record for your personal API (/v1/me/records) and your encrypted account vault.
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
  deleteAccount(relay: string, username: string, password: string): Promise<number>
  isPaired(): boolean
  getSleep(startMs: number, endMs: number): Promise<[number, number][]>
  syncNow(): Promise<SyncResult>
  backfill(days: number): Promise<{ status: number; workouts: number; total: number; daily?: number }>
  seedDemoWorkout(sport: string, minutes: number, endedMinutesAgo: number): Promise<boolean>
  getVault(): Promise<{ status: number; vault: string }>
  saveVault(json: string): Promise<number>
  speak(text: string): Promise<{ status: number; words?: { text: string; start_s: number; stop_s: number }[] }>
  stopSpeaking(): void
  listen(): Promise<{ status: number; text?: string }>
}

export const HealthKit = requireOptionalNativeModule<HuskyHealthKitNative>('HuskyHealthKit')
