// HealthKit -> the website's own Features JSON and engine, all on the phone.
// Same code as huskyhealth.pages.dev (web/js), so the app and the site agree on every number.
import { HealthKit } from '../../modules/health-kit'
// @ts-expect-error plain ES module shared with the website
import { toFeatures } from '../../../web/js/features.js'
// @ts-expect-error plain ES module shared with the website
import { analyze } from '../../../web/js/engine.js'

export const WINDOW_DAYS = 60
const DAY = 86_400_000

export async function loadFeatures(now = Date.now()) {
  if (!HealthKit) throw new Error('HealthKit module missing (iOS only)')
  const start = now - WINDOW_DAYS * DAY
  const workouts = await HealthKit.getWorkouts(WINDOW_DAYS)
  // heart rate only inside workouts (zones, TRIMP); plus daily resting HR, HRV, VO2 max, effort
  const hr: [number, number][] = []
  for (const w of workouts) hr.push(...(await HealthKit.getSamples('hr', w.start, w.end)))
  const [rhr, hrvMs, vo2, effort, effortEst] = await Promise.all([
    HealthKit.getSamples('rhr', start, now), HealthKit.getSamples('hrv', start, now),
    HealthKit.getSamples('vo2', start, now), HealthKit.getSamples('effort', start, now),
    HealthKit.getSamples('effortEst', start, now),
  ])
  const scan = {
    samples: { hr, rhr, hrv: hrvMs, vo2, effort, effortEst },
    workouts: workouts.map((w) => ({ ...w, min: w.min })),
    now, days: WINDOW_DAYS, source: 'healthkit',
  }
  const features = toFeatures(scan)
  return { features, analysis: analyze(features), sports: workouts.map((w) => w.sport) }
}
