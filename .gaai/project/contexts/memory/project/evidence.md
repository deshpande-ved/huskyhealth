---
type: memory
category: project
id: PROJECT-EVIDENCE-001
tags:
  - evidence
  - privacy
  - presidio
  - mitmproxy
  - hipaa
  - threat-model
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (section 9)
---

# Evidence Stack

> How each privacy claim is proven. Code sketch copied exactly from the plan.

| Claim | Tool | Evidence | Demo beat |
|---|---|---|---|
| Nothing leaves during import and scoring | airplane mode + service worker + CSP | works with radios off; zero requests in Network tab | airplane-mode import |
| The page can't send data anywhere else | CSP `connect-src 'self'` | the header itself | devtools → headers |
| Nothing identifying reaches the relay | pydantic allowlist | unknown fields → 422 | smuggle fixture → 422 |
| Nothing slips through | Microsoft Presidio | 0 findings on every request, prompt and brief | smuggle fixture → `DEVICE_NAME` flagged |
| You know exactly what left the Pi | mitmproxy (mitmweb) | independent capture of every Claude and Gradium request | Claude: numbers only · Gradium: one passage |
| It meets a recognized standard | HIPAA Safe Harbor | 18-identifier checklist | one slide |
| (optional) residual risk is low | ARX | measured re-identification risk of brief fields | before/after slide |

## 9.1 Presidio (independent tripwire on the relay)

- pip install with the **small** spaCy model (`en_core_web_sm`). Build on `python:3.12-slim`; don't assume Microsoft's image runs on ARM.
- **Scan:** keys and string values of incoming JSON, the outbound prompt, Claude's brief. Not number arrays (digit runs look like phone numbers).
- **Custom recognizer** for `’s Apple Watch / iPhone / iPad` (device names usually contain the owner's first name).
- **Exclude `DATE_TIME`,** or "7-day" trips it.
- **Log counts only.** `GET /v1/audit` shows them.
- **Gotcha:** `tldextract` tries to download a suffix list on first use; in the jailed relay it falls back to its bundled copy. `HOME=/tmp` (tmpfs) gives it somewhere to write.

```python
# relay/pii.py
import json
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
from presidio_analyzer.nlp_engine import NlpEngineProvider

_nlp = NlpEngineProvider(nlp_configuration={
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
}).create_engine()
ANALYZER = AnalyzerEngine(nlp_engine=_nlp, supported_languages=["en"])
ANALYZER.registry.add_recognizer(PatternRecognizer(
    supported_entity="DEVICE_NAME",
    patterns=[Pattern("owner_device", r"\b[\w\-]+['’]s\s+(?:Apple\s+Watch|iPhone|iPad)\b", 0.9)],
))
ENTITIES = ["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "LOCATION", "IP_ADDRESS",
            "URL", "US_SSN", "CREDIT_CARD", "DEVICE_NAME"]          # DATE_TIME deliberately excluded


def strings_of(obj) -> list[str]:
    if isinstance(obj, dict):
        return [s for k, v in obj.items() for s in [k, *strings_of(v)]]
    if isinstance(obj, list):
        return [s for v in obj for s in strings_of(v)]
    return [obj] if isinstance(obj, str) else []


def pii_types(text: str) -> list[str]:
    hits = ANALYZER.analyze(text=text, language="en", entities=ENTITIES, score_threshold=0.5)
    return sorted({h.entity_type for h in hits})
```

## 9.2 ARX (optional, F18)

- Measures re-identification risk under prosecutor, journalist and marketer attacker models (NIST IR 8053). Used on a German hospital network with ~3 million patients.
- **Steps:** 1) generate a synthetic cohort of `BriefIn` rows; 2) mark every column quasi-identifying, k = 5; 3) read the risk view before and after rounding; 4) copy chosen widths into `bucketize()`.
- **Effort:** 2–3 h. Lower priority: everything that leaves is already rounded aggregates.

## 9.3 mitmproxy (independent egress capture)

- Two reverse listeners: `:8080` in front of `api.anthropic.com`, `:8082` in front of Gradium.
- On stage show **two requests:** Claude got rounded numbers, Gradium got one passage.
- **Gotcha:** mitmweb shows request headers including both API keys → use dedicated hackathon keys, show the **Request body** tab (not headers), revoke both keys after judging.

## 9.4 HIPAA Safe Harbor checklist (slide)

HIPAA doesn't legally cover a consumer app; Safe Harbor is the benchmark.

| | Identifier | HuskyHealth |
|---|---|---|
| A | Names | Never sent. Source names ("Ved's Apple Watch") normalized to "Apple Watch" locally; Presidio tripwire |
| B | Geography smaller than a state | GPS routes never opened; no location fields |
| C | Dates (except year), ages over 89 | Dates never leave the phone; brief has no timeline; no ages |
| D–L | Phone, fax, email, SSN, record/plan/account/licence numbers, vehicle IDs | Not collected; Presidio tripwire |
| M | Device identifiers and serials | No device fields leave the phone; relay schema rejects them |
| N | URLs | Not collected; Presidio tripwire |
| O | IP addresses | nginx `access_log off`; `X-Forwarded-For` stripped before the relay |
| P | Biometric identifiers | By default raw HR never leaves the phone, mic off. Opt-in disclosed: convenience mode sends recent HR (encrypted at rest); voice check-ins send ≤ 5 s audio, keep only a number |
| Q | Full-face photos | None |
| R | Any other unique identifying code | Tokens random, single-use, unlinked, deleted on use |

## 9.5 Threat model

| Who | What they could see | Mitigation and proof |
|---|---|---|
| Venue Wi-Fi / ISP | that you loaded the app; ciphertext for briefs | TLS; import and scoring need no network |
| Tailscale Funnel relays | ciphertext only | TLS terminates on the Pi |
| Ved / the Pi | only `BriefIn` (~20 rounded numbers), only if you ask | relay read-only, no volumes, no body logs; `docker diff`, token grep |
| Malicious operator shipping different JS | could, in theory, change the app | Pages builds from the public repo; About shows deployed commit; CSP limits requests to app + relay; Network tab |
| Cloudflare (Pages) | static-file requests: IP, browser, time; never health data | no analytics or script injection on the hostname; nothing personal sent to the static host |
| Anthropic | rounded numbers after consent | mitmweb, Presidio, schema |
| Gradium | one passage of coaching text after a second consent | mitmweb, Presidio, ZDR if available |
| The Pi, **convenience mode ON** | plaintext for ms per sync; ciphertext up to 24 h | encrypted to a key only the phone holds; RAM only; OFF by default |
| Gradium, **voice check-ins ON** | ≤ 5 s audio per check-in | opt-in, push-to-talk, only a number returned, ZDR if available |
| A coach whose voice is cloned | their own voice, used for briefs | written consent, labeled AI, deletable in Studio |
| Other users / the internet | nothing: no accounts, no stored data | single-use tokens; replay → 410 |
| Other apps on the phone | the `export.zip` left in Files | app tells you to delete it after import |
