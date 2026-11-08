# HuskyHealth Sync: Shortcut build sheet

Convenience mode is **off by default**. Turn it on in the app (Settings → Convenience mode); it shows a **pairing code** once.

Users don't build this: they open the shared iCloud link, tap **Add Shortcut** and paste their pairing code when asked. This sheet is for building (or rebuilding) the template.

**Why heart rate, not workouts:** Shortcuts can't read workouts back from Health (no "Workouts" type in *Find Health Samples* on iOS 26). So the Shortcut sends the last 24 hours of heart rate, and the app finds the workout in it: during a workout the Watch records heart rate every few seconds, otherwise every few minutes. A run of readings no more than 75 s apart (raw or per-minute averages) lasting at least 10 minutes is a session (method: ours). A session that ended less than 10 minutes before sending waits for the next run.

**Where the workout type comes from:** a second, tiny shortcut, **HuskyHealth Workout**, runs from a "workout starts" automation (one per sport) and saves the Watch's workout type with the time: `walking|2026-11-07T18:05:00-05:00`. The Sync shortcut sends it as a `mark`; the app labels the session that starts within 20 minutes of it. Sessions with no mark keep the payload's sport (`other`).

Relay: `https://veds-pi5.polecat-nominal.ts.net:10000`

## HuskyHealth Workout (the type marker)

A separate shortcut, no secrets in it, so it shares as its own iCloud link.

1. **Format Date**: **Current Date**, format **ISO 8601**.
2. **Text**: *Shortcut Input* `|` *Formatted Date* (e.g. `walking|2026-11-07T18:05:00-05:00`).
3. **Save File**: the Text, to the Shortcuts folder, path `HuskyHealth/mark.txt`, **Overwrite If File Exists** on, **Ask Where to Save** off.

Automations that call it (Shortcuts → Automation → **+** → **Workout**), one per sport: pick the workout type (e.g. **Squash**), **Starts**, **Run Immediately**, then **Run Shortcut** → **HuskyHealth Workout** with input text `squash`. Use `squash`, `running`, `walking`, `cycling`, `strength`, `hiit` or `other`.

## Paste the pairing code

1. **Split Text**: the pairing code (`BOXID:WRITESECRET`), by **Custom** `:`. Rename its output `parts`. For the shared template, make this an **Import Question** ("Paste your HuskyHealth pairing code") so the link never carries anyone's secret.
2. **Get Item from List** → **First Item** from `parts` → **Set Variable** `box`.
3. **Get Item from List** → **Last Item** from `parts` → **Set Variable** `write`.

## Read recent heart rate

4. **Find Health Samples**: type **Heart Rate**, **Start Date is in the last 1 days**, sort by Start Date **Oldest First**, no limit.

## Stop unless there was a workout

5. **Count** (input: Health Samples).
6. **If** Count **is less than** `350` → **Stop This Shortcut** → **End If**. A rest day is about 230 readings; a 30-minute workout adds about 360. Under 350 means no workout: **no network**.

## Build the payload

No per-reading loop: Shortcuts turns a whole list in one step, so this stays fast with thousands of readings. (Don't use *Group by*: for heart rate it **sums** the readings in each interval instead of averaging them.)

7. **Get Details of Health Sample** → **Start Date** (input: the Health Samples from step 4) → a list of dates.
8. **Format Date** (input: those dates) → Date Format **ISO 8601** → a list like `2026-11-07T18:01:02-05:00`.
9. **Combine Text** (Formatted Date), separator **Custom** `","` (quote, comma, quote).
10. **Get Details of Health Sample** → **Value** (input: the Health Samples from step 4).
11. **Combine Text** (Value), separator **Custom** `,`
12. **Text** (one line): `{"v":1,"workouts":[{"sport":"squash","start_s":86400,"end_s":0,"kcal":null,"src":"watch","hr_t":["`*Combined dates*`"],"hr_v":[`*Combined values*`]}],"rhr":[],"hrv":[],"effort":[]}`

If Value includes units, add **Get Numbers from Input** before step 11. Times are real timestamps here; the relay seals them within milliseconds, and the phone keeps only day offsets.

Payload schema (anything else gets a generic 422; times are **seconds before sending**, never dates; no device names, source names or GPS):

| Field | Type |
|---|---|
| `v` | always `1` |
| `workouts[]` | up to 20 windows (`hr[]` of `{t_s, v}`, **or** parallel `hr_t[]` ISO 8601 times + `hr_v[]` heart rates 20–300): `sport` (`squash` / `running` / `walking` / `cycling` / `strength` / `hiit` / `other`), `start_s` ≥ `end_s` (int, 0–259200), `kcal` (number or null), `src` (`watch` / `garmin` / `other`), `hr[]` (up to 4000 `{t_s, v}`) |
| `rhr[]`, `hrv[]`, `effort[]` | `{t_s, v}` samples (empty from this Shortcut) |
| `marks[]` | up to 20 `{sport, t_s}`: the Watch's workout type and seconds since it started |

Example:

```json
{"v": 1,
 "workouts": [{"sport": "other", "start_s": 86400, "end_s": 0, "kcal": null, "src": "watch",
               "hr": [{"t_s": 86390, "v": 71}, {"t_s": 5400, "v": 128}, {"t_s": 5395, "v": 131.5}]}],
 "rhr": [], "hrv": [], "effort": [], "marks": [{"sport": "walking", "t_s": 5410}]}
```

## POST the drop

11. **Get Contents of URL**: `https://veds-pi5.polecat-nominal.ts.net:10000/v1/drop/` + `box`. **Show More**: Method **POST**; Headers `Authorization` = `Bearer ` + `write`, `Content-Type` = `application/json`; Request Body **File** = the Text from step 12.

An empty reply (HTTP 204) is success. `{"error":"conflict"}` means the app hasn't collected the previous drop yet; the next run after you open the app sends again. Repeats are harmless: the relay keeps one drop per box and the app ignores sessions it already has.

## Triggers (Shortcuts → Automation → +)

- **App → Is Opened**: pick several everyday apps (Messages, Safari, Instagram…). **Run Immediately** on, **Notify When Run** off. iOS has no "when iPhone is unlocked" trigger; opening one of these means the phone is unlocked, so Health is readable.

The network is touched only when there is a new workout in the last 24 hours (step 6); most runs stop there.

## Turning it off

In the app: Settings → **Turn off convenience mode**. The phone deletes its key and the relay forgets the box; the Shortcut's posts then fail with `not found`. Delete the automations too.
