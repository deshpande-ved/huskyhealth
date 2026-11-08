# Demo: the zero-knowledge personal API

Apple has no web API for HealthKit. HuskyHealth gives you one, and the server can't read it.

## Setup (once)

1. Website → `./account` → log in. The first login after this feature makes your account's keypair in the browser; only the public key goes to the Pi.
2. iPhone app → **Account** → log in with the same username and password. The phone derives the keys itself, makes its own write token, and keeps it in the Keychain.

## Show it (about 60 s)

1. Finish a workout on the Watch (or tap **Demo workout** in the app). iOS wakes HuskyHealth, which posts the workout to `POST /v1/me/records`.
2. Website → `./account` (logged in): within 30 s, "1 new record from your devices", and `./today` updates.
3. The golden egg, from a terminal:
   ```bash
   curl -X POST https://veds-pi5.polecat-nominal.ts.net:10000/v1/me/records \
     -H "Authorization: Bearer $HH_TOKEN" -H "Content-Type: application/json" \
     -d '{"v":1,"workouts":[{"sport":"running","start_s":3600,"end_s":600,"hr":[{"t_s":3500,"v":142},{"t_s":3490,"v":145}]}]}'
   ```
   ```bash
   node scripts/huskyhealth.mjs records --user <you>
   ```
4. Proof the Pi can't read it (on the Pi):
   ```bash
   cd ~/services/huskyhealth && docker compose exec -T relay sh -c 'ls /data/vaults; head -c 400 /data/vaults/*.inbox.json'
   ```
   Only ciphertext (`key`, `nonce`, `ct`) and receive times.

## What leaves the phone

Each new workout: sport, start and end (seconds before sending), heart rate during it, calories, resting HR, HRV and Watch effort. No names, places, GPS or device names: the relay's schema rejects them.
