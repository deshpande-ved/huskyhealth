---
type: memory
category: project
id: PROJECT-PRIZES-001
tags:
  - strategy
  - prizes
  - demo
  - pitch
  - devpost
  - gradium
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (sections 0, 12)
---

# Prizes, Demo and Pitch

## Prize strategy (0)
| Prize | Enter? | What wins it | Extra hours |
|---|---|---|---|
| **Privacy-First** (main; 1st $2,500 + perks) | Yes | airplane-mode proof, cited science, consent per provider, convenience mode OFF by default | the plan |
| **Best Use of Gradium** (side, stacks) | Yes | all three capabilities, each privacy-safe; coach's voice is the creative hook | +0.5 clone, +1.5 check-ins, on top of spoken brief |
| **Most Startup-able** (1st $1,750) | Yes (cheap) | first customer (NEU Club Squash), who pays, why now, why you | +0.5–1 |
| **Big Brother** ($400) | opportunistic | codewords at events on your path | ~1 |
| **Surge** (Tavily/Exa) | Optional (F19) | evidence agent citing studies for References; long shot as a side feature | 2.5–3 |
| **Signal-to-Dose** | No | different problem | — |

### Gradium (0.1)
- **Speak (TTS, default):** readiness brief read aloud, each word highlighted as spoken.
- **Coach's voice (cloning):** a consenting coach records ~10 s once; athletes hear their coach. Labeled AI, deletable, never a user's voice.
- **Listen only when asked (STT, opt-in, OFF by default):** hold mic, say effort ("seven"); only the number survives. Fills the squash gap (Apple doesn't estimate squash effort).
- Pitch line: "We use voice to talk to you. We only listen when you ask, and only a number survives."
- At the 1 PM fair: ask the Gradium rep how the prize is judged and whether hackathon credits allow Zero Data Retention.

### Startup-able (0.2)
- **One line:** training insight from your watch, from an app that can't see your data.
- **Who:** club/varsity athletes and coaches. First customer: NEU Club Squash (Ved is VP).
- **Who pays:** athletes free; teams pay per season for coach's voice, auto-sync, team view (≥ 5 athletes, noise-protected). Schools: nothing sensitive stored → less compliance burden.
- **Why now:** ChatGPT Health (Jan 2026) pulls medical records into a chatbot; Apple rule 5.1.2(i) (Nov 2025) requires consent before data goes to third-party AI.
- **Why this team:** Ved built and runs NEU SquashHub for his club (live users, own infra), and is the customer.
- **Ask:** a spring pilot with Club Squash.

### Big Brother (0.3) and Solo (0.4)
- Points per person per event from codewords said aloud; Discord bonus codewords close 15 min after drop. Solo → only codewords on your path: 1 PM fair, workshop, dinner, 10 PM activity, 2 AM broadcast, morning Red Bull drop. Keep Discord notifications on; spell the team name identically everywhere.
- Ved builds alone; every feature keeps its hours in the feature menu (11.1) until he cuts.

### Devpost (0.5) — due 11:00 Sunday
- Done: registered, project created. Required: demo video, repo link, short write-up, tracks.
- Tracks: Privacy-First + Most Startup-able + Best Use of Gradium (if not listed, say so in the write-up).
- Write-up order: what it does (2 lines) → what leaves the device, who can read it, how we prove it → the science → how we use Gradium (3 capabilities, 3 rules) → the business → built with, repo, video.
- Never show API keys or perk codes.

## Demo video (12.1) — required; 2–3 min, recorded 09:15
- Screen + phone via QuickTime over USB (not iPhone Mirroring), narrated in own voice. Never on screen: API keys, perk codes, mitmweb headers.
1. 0:00–0:15 Hook: "Every recovery app wants your heart data on its servers. HuskyHealth never asks for it."
2. 0:15–0:50 airplane mode on → open from Home Screen → import `export.zip` → today's call.
3. 0:50–1:10 tap the call → its References card.
4. 1:10–1:40 network on → coaching brief → coach's cloned voice, words highlighting.
5. 1:40–2:10 mitmweb Body tab: Claude got numbers, Gradium got one passage. `smuggle.sh` → 422.
6. 2:10–2:30 Settings: convenience mode + voice check-ins both OFF by default. If built, one sync.
7. 2:30–2:45 who it's for; Club Squash pilot.

## Expo table (12.2) — 12:15–13:30; side-track winners picked here
- 60–90 s loop per judge: airplane import (or quick re-import), call + References card, brief in coach's voice, mitmweb.
- Lead with what the judge scores: Privacy-First → airplane mode then mitmweb; Gradium → coach's voice then check-in; Startup → pilot and who pays.
- Bring: charged phone, Mac with mitmweb on Body tab, morning export in Files, phone voice ready if Gradium lags.

## Top-6 pitch (12.3) — 3 min + 2 min Q&A
Hook (15 s) → one-liner (15 s) → live demo: airplane import → brief in coach's voice (75 s) → proof: mitmweb + smuggle (30 s) → the science (15 s) → business and ask (30 s).

## Backups (12.4)
- Morning export in Files + copy on the Mac; the demo video itself.
- Gradium slow/down → **Use phone voice** (fully private anyway).
- Venue Wi-Fi blocks port 10000 → cellular for the brief. Import and scoring need no network.

## Likely judge questions (12.5)
| Question | Answer |
|---|---|
| Isn't the Pi just a server? | By default it does nothing for you: app from Cloudflare Pages, runs on your phone. Only if you ask does the Pi relay ~20 rounded numbers. Watch it work in airplane mode. |
| Isn't auto-sync a server holding my data? | OFF by default. If on, the Pi stores only data encrypted to a key that never leaves your phone, in memory, ≤ 1 day. |
| How do I know the JS doesn't upload my data? | CSP allows only the app and the relay; Network tab shows zero requests during import; Pages builds from the public repo and the app shows its commit. |
| Where's the science? | Every number links to its method: Edwards TRIMP, Foster session-RPE and monotony, Banister model, Plews' HRV band (adapted). Ours is labeled ours. |
| Is the engine valid? | Unit-tested against published definitions, behaves as literature predicts in scenario tests, tracks GoldenCheetah's open-source Banister model on the same files. Data gates flag thin inputs. Training insight, not a medical device; not yet user-tested: that's the pilot. |
| What does Gradium hear? | By default one passage of coaching text after a tap. Only with voice check-ins on, ≤ 5 s of you saying a number; only the number comes back. |
| Why clone a voice in a privacy project? | Only a consenting coach's voice, never a user's. Labeled AI, deletable. |
| Does the AI decide my training? | No. Published rules make the call; Claude explains and can't change it. |
| Why not an app? | Native can't ship in a weekend. PWA works for anyone today; native (HealthKit, no export) is next. |
| Garmin? | Garmin Connect syncs into Apple Health on iPhone, so it comes in with the export. Readiness needs HRV. |
| HIPAA compliant? | HIPAA doesn't apply to consumer apps; benchmarked against Safe Harbor's 18 identifiers. |
| Who would pay? | Teams, per season, for coach's voice, auto-sync, team view. NEU Club Squash is the pilot. |
