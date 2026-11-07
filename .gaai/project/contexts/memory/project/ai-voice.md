---
type: memory
category: project
id: PROJECT-AI-001
tags:
  - ai
  - voice
  - gradium
  - claude
  - privacy
  - consent
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (section 8: 8.1, 8.2, 8.4)
related:
  - project/ai-brief-relay.md   # 8.3 Claude call, schema and code
---

# AI and Voice Features

> Part 1 of section 8. The readiness-brief Claude call (8.3, schema + code) is in `ai-brief-relay.md`.

---

## 8.1 Privacy rules for every AI feature

- **Rules decide, AI explains.** The call comes from the engine (7.1); Claude can't change it.
- **Fixed fields per feature,** enforced by a strict schema on the relay. Values are rounded before they leave the relay.
- **Presidio on all text leaving the relay:** every prompt, and Claude's brief before anyone hears it.
- **mitmweb logs every outgoing call** to Claude and Gradium.
- **Consent per feature and per provider,** with a preview of exactly what that provider gets.
- **Voice out by default.** STT only for opt-in effort check-ins (only a number survives). Cloning only of a consenting coach, never a user.
- **On-device fallback:** the phone's own speech synthesis reads the brief; nothing leaves the phone.

## 8.2 Feature list (IDs match feature menu 11.1)

| ID | Feature | Provider sees | Hours |
|---|---|---|---|
| F7 | Readiness brief | Claude: ~20 rounded numbers + the engine's call | 3–3.5 with the relay |
| F9 | Load alerts (monotony, load spike) | Claude: flag names, inside the brief call | 0.5 |
| F10 | Spoken brief (Gradium TTS) + word captions + phone voice | Gradium: the brief text | 1.5–2 |
| F11 | Coach's voice (Gradium cloning) | Gradium: ~10 s from a consenting coach, once | 0.5 |
| F12 | Voice effort check-in (Gradium STT) | Gradium: ≤ 5 s audio, opt-in, OFF by default; only a 1–10 number returns | 1.5 |
| F16 | Match taper planner | Claude: days to match (a count), form, recent sport mix | 1.5 |
| F17 | Ask HuskyHealth | Claude: redacted question + answers to narrow lookups | 1.5–3 |
| F19 | Evidence agent (enters Surge) | Tavily/Exa: fixed generic method queries; Claude: search results | 2.5–3 |

- **F7:** "go hard or keep it easy today, and why." Claude writes 2–3 sentences citing the signals behind the engine's call.
- **F9:** monotony > 2 and load spikes ride along in the brief. Always "load alert," never "injury risk."
- **F10:** **Read it aloud** sends Claude's exact text to Gradium; captions highlight each word. **Use phone voice** stays on-device.
- **F11:** athletes hear their own coach read the brief, labeled as an AI voice.
- **F12:** "seven" → 7. Feeds session-RPE where Apple gives no effort estimate (squash).
- **F16:** input "match in N days" (a count, never a date). Engine sets daily load ranges by standard tapering: cut volume ~40–60% over the last 7–14 days, keep intensity, from current fitness and form. Claude turns each day into a squash session (ghosting, court sprints, solo drills, rest), drawn as an ASCII calendar.
- **F17:** question box; Presidio's anonymizer strips names and places first. Page sends up to 12 weekly summaries with the question. Claude can call three tools the relay evaluates over that request's data only: `weekly_trend`, `compare_periods`, `sport_breakdown`. Page lists every lookup Claude made. Nothing stored.
- **F19:** when a References card opens, the relay searches Tavily/Exa for recent studies on that method; shows three cited sources with one-line summaries (Claude). Queries only from a fixed list per method (e.g. "HRV-guided training rolling average smallest worthwhile change"); no user numbers, dates or sports in queries. Results cached per method on the relay (no user data). Uses hackathon Tavily/Exa credits.

**Never:** clone a user's voice · always-on listening · injury prediction (evidence disputed) · shareable AI recaps (sharing ties data back to a person).

## 8.4 Gradium: speak, coach's voice, listen only when asked

- **Side prize:** Best Use of Gradium stacks with Privacy-First. Prizes: extra credits; gallery feature + interview; Startup Program fast-track for most creative use. The deck names STT, TTS and cloning; HuskyHealth uses all three.
- **Pitch line:** "We use voice to talk to you. We only listen when you ask, and only a number survives."
- **Budget:** 145k credits ≈ 3.2 h of speech or ~9.7 h of transcription (free tier 45k ≈ 1 h speech / 3 h transcription). ≈ 380 thirty-second briefs, or thousands of 5-s check-ins. Brief ~30 s, check-in ~5 s. `/v1/speak` and `/v1/listen` both have hourly limits.
- **Zero Data Retention:** covers text and audio, both directions. Self-serve on paid plans: Gradium Studio → Profile → My organization → Privacy Settings. Ask the rep at the fair whether hackathon credits unlock it; if not, say so in the pitch.
- **Region:** `us.api.gradium.ai` or `eu.api.gradium.ai`, used as the egress target. **Evidence slide:** SOC 2 Type II and ISO 27001.

1. **Spoken brief (TTS, default):**
   - **Read it aloud** sends Claude's exact brief; the speak token is bound to its hash.
   - Gradium word-level timestamps drive a caption highlighting each word as spoken.
   - **Use phone voice** (`speechSynthesis`, on-device) is the fallback and works in airplane mode.
2. **Coach's voice (cloning):**
   - In Gradium Studio, record ~10 s from a consenting coach (demo: Ved, as Club Squash VP). Instant clone needs ~10 s of audio.
   - Voice ID becomes `GRADIUM_VOICE_ID`; briefs play in that voice, labeled "AI voice of Coach ___."
   - Rules: voice owner gives written consent; never clone a user; coach can delete the clone in Studio.
   - Business hook: teams subscribe so athletes hear their own coach.
3. **Voice effort check-in (STT, opt-in, OFF by default):**
   - Typing a number is the default. Mic stays off unless voice check-ins are on.
   - After a workout, hold the mic button and say "seven" (≤ 5 s). PWA records with `getUserMedia`, posts to `/v1/listen`; relay sends audio to Gradium STT through egress.
   - Relay extracts one integer 1–10 and returns only that. Audio and transcript discarded, never logged.

- **Wiring:**
  - Relay calls `GRADIUM_BASE_URL` (`http://egress:8082`).
  - Take exact paths, auth header and bodies for one-shot speech and transcription from https://docs.gradium.ai/api-reference/introduction. Pipecat's integration uses WebSocket endpoint `/api/speech/tts`; if one-shot REST isn't offered, add `websockets` to `relay/requirements.txt`.
  - nginx sends `Permissions-Policy: microphone=(self), camera=(), geolocation=()`, so the page can never ask for location or camera.
