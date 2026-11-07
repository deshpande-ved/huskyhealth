---
type: memory
category: project
id: PROJECT-INFRA-002
tags:
  - infra
  - deploy
  - pi
  - funnel
  - cloudflare-pages
  - csp
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (sections 10.3, 10.3b)
---

# Deploy: Pi relay + Funnel, PWA on Cloudflare Pages

> Pi commands and GitHub identity / remote / Pages-connection steps are **ask Ved first** (repo-safety rules).

## Pi relay (10.3)
1. Clone. Confirm the GitHub identity with Ved first (`<owner>` placeholder below; identity names kept private).
   ```bash
   git clone git@github.com:<owner>/huskyhealth.git ~/services/huskyhealth
   ```
2. Create the real `.env` on the Pi, then fill in the two keys by hand (dedicated hackathon keys; never commit them).
   ```bash
   cat > ~/services/huskyhealth/.env << 'ENVEOF'
   ANTHROPIC_API_KEY=
   GRADIUM_API_KEY=
   GRADIUM_VOICE_ID=REPLACE_ME
   ENVEOF
   chmod 600 ~/services/huskyhealth/.env
   ```
3. Start it.
   ```bash
   cd ~/services/huskyhealth && docker compose up -d --build
   ```
4. Open Funnel on the free port.
   ```bash
   sudo tailscale funnel --bg --https=10000 http://localhost:8090
   ```
5. Verify: `tailscale funnel status` shows `10000 → 8090` and the Pi's existing Funnel entries are still present.
6. Redeploy after each merge: `cd ~/services/huskyhealth && git pull && docker compose up -d --build`, then bump the service-worker cache name (`infra-pwa.md`) so phones fetch new code.
- Never reset Tailscale serve config; change only the relay's own entry.
- Relay URL (public, in the CSP): `https://veds-pi5.polecat-nominal.ts.net:10000`.

## Cloudflare Pages (10.3b)
1. **GitHub identity first:** Pages connects via the GitHub account its app is installed on. Ask Ved which account before connecting.
2. **Create project:** Cloudflare dashboard → Pages project connected to Git → repo `huskyhealth`, name `huskyhealth`.
3. **Build settings:** production branch `main`; no framework preset; build command `echo "$CF_PAGES_COMMIT_SHA" > web/version.txt`; output dir `web`. The app's About reads `/version.txt`, so anyone can match the running commit to GitHub.
4. **Custom domain:** `huskyhealth.vedsite.com` (DNS already on Cloudflare; record auto-created).
5. **No script injection on this hostname:** Web Analytics, Rocket Loader, Email Address Obfuscation, Zaraz all OFF (they break the CSP and add third parties).
6. **Previews:** each branch push → `<branch>.huskyhealth.pages.dev`; gateway CORS map already allows them.
7. **Check:** `curl -sI https://huskyhealth.vedsite.com | grep -i content-security-policy` shows the `_headers` policy; About commit matches GitHub.

## `web/_headers` (the CSP lives here, not in nginx)
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://veds-pi5.polecat-nominal.ts.net:10000; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Permissions-Policy: microphone=(self), camera=(), geolocation=()
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Content-Type: application/manifest+json
```
