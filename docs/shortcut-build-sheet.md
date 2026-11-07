# HuskyHealth Sync: Shortcut build sheet

Convenience mode is **off by default**. Turn it on in the app (Settings → Convenience mode) first; it shows a **pairing code** once. Then build this Shortcut on the iPhone, in the Shortcuts app, named **HuskyHealth Sync**.

What it does: when you open an everyday app (so the phone is unlocked), it checks Health locally for a workout newer than the last one it sent. **It touches the network only when there is a new workout.** It then sends that workout, its heart rate and the last 3 days of resting heart rate, HRV and effort to the relay, which encrypts it to a key only your phone holds.

Relay: `https://veds-pi5.polecat-nominal.ts.net:10000`

## Paste the pairing code

1. **Text**: paste the pairing code (looks like `BOXID:WRITESECRET`). Keep this Shortcut private: the write secret lets anyone post into your box.
2. **Split Text** by Custom `:`.
3. **Get Item from List** → First Item → **Set Variable** `box`.
4. **Get Item from List** → Last Item → **Set Variable** `write`.

## Read state.json

5. **Get File** from Shortcuts folder, path `HuskyHealth/state.json`, *Error If Not Found* **off**.
6. **If** File *has any value*: **Get Dictionary from Input** → **Set Variable** `state`. **Otherwise**: **Dictionary** with `last_check` = `2000-01-01` and `last_end` = (Current Date minus 3 days) → **Set Variable** `state`.

## 15-minute throttle

7. **Get Time Between Dates**: from `state.last_check` to Current Date, in **Minutes**.
8. **If** result **is less than** 15 → **Stop This Shortcut**. (No Health query, no network.)

## Check for a new workout

9. **Find Health Samples**: Type **Workout**, *Start Date is after* `state.last_end`, Sort by Start Date (Latest First), **Limit 1**.
10. **If** the result *does not have any value*: set `state.last_check` to Current Date, **Save File** (`HuskyHealth/state.json`, Overwrite **on**), **Stop This Shortcut**. (Still no network.)

## Build the payload

11. **Find Health Samples**: Type **Workout**, *Start Date is after* `state.last_end`, Sort by Start Date (Oldest First), Limit 5. **Repeat with Each**:
    - `sport`: **If** Workout Type contains `Squash` → `squash`; contains `Running` → `running`; otherwise `other`.
    - `start_s` = **Get Time Between Dates** (Start Date → Current Date) in **Seconds**; `end_s` = same for End Date.
    - `kcal` = Active Energy (number only; leave out if empty).
    - `src` = `watch` if Source contains `Watch`, `garmin` if it contains `Garmin` or is `Connect`, else `other`.
    - `hr`: **Find Health Samples** Type **Heart Rate**, *Start Date is between* the workout's Start and End Date, Oldest First. **Repeat with Each**: Dictionary `t_s` = Time Between (sample Start Date → Current Date) in Seconds, `v` = Value. Collect into a list.
    - **Dictionary** with the keys above → **Add to Variable** `workouts`.
12. `rhr`: **Find Health Samples** Type **Resting Heart Rate**, *Start Date is in the last 3 days* → each as `{t_s, v}` like above.
13. `hrv`: same with **Heart Rate Variability**.
14. `effort`: same with **Workout Effort** if your iOS version lists it; otherwise leave `effort` as an empty list (you can rate effort in the app).
15. **Dictionary** `{ "v": 1, "workouts": workouts, "rhr": rhr, "hrv": hrv, "effort": effort }`.

Payload schema (the relay rejects anything else with a generic 422; times are **seconds before sending**, never dates; no device names, source names or GPS):

| Field | Type |
|---|---|
| `v` | always `1` |
| `workouts[]` | up to 20: `sport` (`squash` / `running` / `other`), `start_s`, `end_s` (int, 0–259200, start ≥ end), `kcal` (number or null), `src` (`watch` / `garmin` / `other`), `hr[]` (up to 4000 `{t_s, v}`) |
| `rhr[]`, `hrv[]`, `effort[]` | `{t_s, v}` samples, int seconds and a number |

Example:

```json
{"v": 1,
 "workouts": [{"sport": "squash", "start_s": 5400, "end_s": 1800, "kcal": 512.0, "src": "watch",
               "hr": [{"t_s": 5400, "v": 96.0}, {"t_s": 5385, "v": 112.0}, {"t_s": 5370, "v": 131.0}]}],
 "rhr": [{"t_s": 61200, "v": 52.0}],
 "hrv": [{"t_s": 64800, "v": 58.0}],
 "effort": [{"t_s": 1800, "v": 7.0}]}
```

## POST the drop

16. **Get Contents of URL**: `https://veds-pi5.polecat-nominal.ts.net:10000/v1/drop/` + `box`, Method **POST**, Headers `Authorization: Bearer ` + `write` and `Content-Type: application/json`, Request Body **File** = the dictionary from step 15.
17. Success is an **empty** reply (HTTP 204). **If** the reply *contains* `error` → **Stop This Shortcut** without updating state, so the next run tries again. (`conflict` means the app has not collected the previous drop yet.)

## Update state.json

18. Only after success: set `state.last_end` to the End Date of the newest workout sent and `state.last_check` to Current Date → **Save File** `HuskyHealth/state.json`, Overwrite **on**.

## Triggers (Shortcuts → Automation → New Automation)

- **App → Is Opened**: pick several everyday apps (Messages, Safari, Instagram…). **Run Immediately** on, **Notify When Run** off. iOS has no "when iPhone is unlocked" trigger; opening one of these means the phone is unlocked, so Health is readable.
- **Apple Watch Workout → Ends**: Run Immediately on.
- **Charger → Is Disconnected**: Run Immediately on.

If a trigger fires while the phone is locked, the Health read fails quietly and the next app open catches up. Most runs stop at step 8 or 10: a local check, no network.

## Turning it off

In the app: Settings → **Turn off convenience mode**. The phone deletes its key and the relay forgets the box; this Shortcut's posts then fail with `not found`. Delete the automations too.
