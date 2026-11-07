# HuskyHealth Sync: Shortcut build sheet

Convenience mode is **off by default**. Turn it on in the app (Settings → Convenience mode); it shows a **pairing code** once.

Users don't build this: they open the shared iCloud link, tap **Add Shortcut** and paste their pairing code when asked. This sheet is for building (or rebuilding) the template.

**Why heart rate, not workouts:** Shortcuts can't read workouts back from Health (no "Workouts" type in *Find Health Samples* on iOS 26). So the Shortcut sends the last 3 hours of heart rate, and the app finds the workout in it: during a workout the Watch records heart rate every few seconds, otherwise every few minutes. A run of readings no more than 30 s apart lasting at least 10 minutes is a session (method: ours). A session that ended less than 10 minutes before sending waits for the next run.

Relay: `https://veds-pi5.polecat-nominal.ts.net:10000`

## Paste the pairing code

1. **Split Text**: the pairing code (`BOXID:WRITESECRET`), by **Custom** `:`. Rename its output `parts`. For the shared template, make this an **Import Question** ("Paste your HuskyHealth pairing code") so the link never carries anyone's secret.
2. **Get Item from List** → **First Item** from `parts` → **Set Variable** `box`.
3. **Get Item from List** → **Last Item** from `parts` → **Set Variable** `write`.

## Read recent heart rate

4. **Find Health Samples**: type **Heart Rate**, **Start Date is in the last 3 hours**, sort by Start Date **Oldest First**, no limit.

## Stop unless there was a workout

5. **Count** (input: Health Samples).
6. **If** Count **is less than** `120` → **Stop This Shortcut** → **End If**. Fewer than 120 readings in 3 hours means no workout: **no network**.

## Build the payload

7. **Repeat with Each** (Health Samples):
   - **Get Details of Health Sample** → Start Date (Repeat Item) → **Get Time Between Dates** (Start Date → Current Date, **Seconds**)
   - **Get Details of Health Sample** → Value (Repeat Item)
   - **Text**: `{"t_s":`*Time Between Dates*`,"v":`*Value*`}`
8. **Combine Text**: Repeat Results, separator **Custom** `,`
9. **Text** (one line): `{"v":1,"workouts":[{"sport":"squash","start_s":10800,"end_s":0,"kcal":null,"src":"watch","hr":[`*Combined Text*`]}],"rhr":[],"hrv":[],"effort":[]}`

If times come out negative, swap the two dates in step 7. If Value includes units, add **Get Numbers from Input** after it.

Payload schema (anything else gets a generic 422; times are **seconds before sending**, never dates; no device names, source names or GPS):

| Field | Type |
|---|---|
| `v` | always `1` |
| `workouts[]` | up to 20 windows: `sport` (`squash` / `running` / `other`), `start_s` ≥ `end_s` (int, 0–259200), `kcal` (number or null), `src` (`watch` / `garmin` / `other`), `hr[]` (up to 4000 `{t_s, v}`) |
| `rhr[]`, `hrv[]`, `effort[]` | `{t_s, v}` samples (empty from this Shortcut) |

Example:

```json
{"v": 1,
 "workouts": [{"sport": "squash", "start_s": 10800, "end_s": 0, "kcal": null, "src": "watch",
               "hr": [{"t_s": 10790, "v": 71}, {"t_s": 5400, "v": 128}, {"t_s": 5395, "v": 131.5}]}],
 "rhr": [], "hrv": [], "effort": []}
```

## POST the drop

10. **Get Contents of URL**: `https://veds-pi5.polecat-nominal.ts.net:10000/v1/drop/` + `box`. **Show More**: Method **POST**; Headers `Authorization` = `Bearer ` + `write`, `Content-Type` = `application/json`; Request Body **File** = the Text from step 9.

An empty reply (HTTP 204) is success. `{"error":"conflict"}` means the app hasn't collected the previous drop yet; the next run after you open the app sends again. Repeats are harmless: the relay keeps one drop per box and the app ignores sessions it already has.

## Triggers (Shortcuts → Automation → +)

- **App → Is Opened**: pick several everyday apps (Messages, Safari, Instagram…). **Run Immediately** on, **Notify When Run** off. iOS has no "when iPhone is unlocked" trigger; opening one of these means the phone is unlocked, so Health is readable.

The network is touched only when there is a new workout in the last 3 hours (step 6); most runs stop there.

## Turning it off

In the app: Settings → **Turn off convenience mode**. The phone deletes its key and the relay forgets the box; the Shortcut's posts then fail with `not found`. Delete the automation too.
