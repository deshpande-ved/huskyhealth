# Information Architecture: HuskyHealth web

## Site Map
- Today `/#today` (default)
  - This week `/#week`
  - Sessions `/#session`
  - Heart-rate zones `/#zones`
  - Methods `/#ref-*` (only from method links)
- Account `/#account` (logged in: your API, history, import, data; logged out: opens the log-in sheet)
- API docs `/api`

## Navigation Model
- **Primary:** `./today` `./api`, top left under the wordmark.
- **Utility:** top right, `log in` (sheet with username, password, log in, create account) or the username (links to account).
- **Contextual:** each today row opens its detail; details link back to today; method footnotes link to methods.
- **Mobile:** same header; the utility button stays top right; the sheet drops full width under the header.

## Content Hierarchy
### Today (with data)
1. The call, printed as an ASCII banner, with one sentence of reason. The only answer most visits need.
2. One line: the date and what the call is based on.
3. Rows: this week, last session, heart-rate zones. Title, one sentence, figure.
### Today (no data)
1. The wordmark banner.
2. One sentence on what happens when you log in on the iPhone app.
3. Two actions: log in, import an Apple Health export. A link to the API.
### Account
1. Your API: device tokens, check for new records, link to docs.
2. History: past reports, workout history.
3. Import an Apple Health export (older than 60 days, or no iPhone app).
4. Data: local copy, clear local data, log out, delete account.

## User Flows
### New athlete
1. Installs the iPhone app, logs in: the last 60 days go to their API.
2. Opens the site on any screen, logs in top right: today fills within 30 s.
### Import instead
1. Today (no data) → import an Apple Health export → progress in the strip → today fills.

## Naming Conventions
| Concept | Label in UI | Notes |
|---|---|---|
| Daily recommendation | the call (`Train hard` / `Go easy`) | |
| Encrypted batch from a device | record | API term |
| Write-only key for a device | device token | |
| Locally cached summaries | local data | no device nouns |
| Apple export file | Apple Health export | |

## Component Reuse Map
| Component | Used on | Behavior differences |
|---|---|---|
| Readout row | today | links to its detail |
| Data table | week, session, zones, account | narrow variant for zone lists |
| ASCII banner | today call, empty state | word changes |

## URL Strategy
Hash routes on one page, so the site works offline from the service worker; `/api` is a separate static page (Cloudflare serves `/api` for `api.html`).
