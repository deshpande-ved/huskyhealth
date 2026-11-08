// Today, from the one source the website also uses: the account vault. The app reads Apple Health, writes its
// workouts and day summaries into the vault (it is the authority on its own workouts), saves the vault encrypted,
// then draws today with featuresFromVault, exactly as web/js/app.js does. Same data, same code, same numbers.
import { HealthKit } from '../../modules/health-kit'
import { loadFeatures } from './health'
import { addToVault, daySummaries, emptyVault, featuresFromVault, makeReport, workoutSummaries } from '../../../web/js/vault.js'
import { analyze } from '../../../web/js/engine.js'
import { todayModel } from '../../../web/js/view.js'

const REPORT_EVERY_MS = 6 * 3600_000     // a report in the vault's history at most every six hours, as the site does on sync

export type Today = { features: any; analysis: any; saved: number }

export async function loadToday(now = Date.now()): Promise<Today> {
  if (!HealthKit) throw new Error('Apple Health is only on iPhone.')
  await HealthKit.requestAuthorization()
  const [hk, got] = await Promise.all([loadFeatures(now), HealthKit.getVault()])
  if (got.status !== 200) throw new Error(got.status === 401 ? 'Log in again.' : `Could not open your history (${got.status}).`)
  const before = got.vault ? { ...emptyVault(), ...JSON.parse(got.vault) } : emptyVault()
  let vault = addToVault(before, null, workoutSummaries(hk.features, now), daySummaries(hk.features, now))
  if (hk.features.max_hr) vault = { ...vault, max_hr: Math.max(hk.features.max_hr, before.max_hr || 0) }
  const features = featuresFromVault(vault, now)
  const analysis = analyze(features)
  const last = before.reports?.[0]?.at ? Date.parse(before.reports[0].at) : 0
  const changed = JSON.stringify(vault.workouts) !== JSON.stringify(before.workouts) || JSON.stringify(vault.days) !== JSON.stringify(before.days)
  if (changed || now - last > REPORT_EVERY_MS) {
    vault = addToVault(vault, makeReport(analysis, features, todayModel(analysis, features).call, { nowMs: now, source: 'app' }), [])
  }
  const saved = JSON.stringify(vault) === JSON.stringify(before) ? 204 : await HealthKit.saveVault(JSON.stringify(vault))
  return { features, analysis, saved }
}
