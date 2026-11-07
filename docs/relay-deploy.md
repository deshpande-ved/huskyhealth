# Relay deploy (Raspberry Pi)

The PWA is on Cloudflare Pages. Only the relay runs on the Pi: `gateway` (nginx, `/v1/` only) → `relay` (Flask, RAM only, read-only container) → `egress` (mitmweb, the only way out). Public URL: `https://veds-pi5.polecat-nominal.ts.net:10000`.

**Never run `tailscale serve reset`.** It wipes every other service's Funnel entry on the Pi. Change only the relay's own entry on port 10000.

## First time (on the Pi)

1. Clone the repo (replace `<owner>` with the GitHub account that owns it):
   ```bash
   git clone git@github.com:<owner>/huskyhealth.git ~/services/huskyhealth && cd ~/services/huskyhealth && git switch staging
   ```
2. Create `.env` with empty keys, lock it down, then fill the keys in by hand in an editor (never paste them into the terminal or a recording):
   ```bash
   cp .env.example .env && chmod 600 .env
   ```
3. Check ports 8090 and 8091 are free (both commands should print nothing):
   ```bash
   sudo lsof -iTCP:8090 -sTCP:LISTEN; sudo lsof -iTCP:8091 -sTCP:LISTEN
   ```
4. Build and start:
   ```bash
   docker compose up -d --build
   ```
5. Check it locally:
   ```bash
   curl -s http://127.0.0.1:8090/v1/healthz; echo; scripts/check-relay-container.sh
   ```
6. Open the relay on Funnel port 10000 (adds one entry; leaves the others alone):
   ```bash
   sudo tailscale funnel --bg --https=10000 http://localhost:8090
   ```
7. Confirm `10000 → 8090` is listed and every entry that was there before is still there:
   ```bash
   tailscale funnel status
   ```

## From the Mac

```bash
scripts/check-gateway.sh https://veds-pi5.polecat-nominal.ts.net:10000
```

If it fails, remove only the relay's own Funnel entry on 10000 and report back; touch nothing else.

## Redeploy after each relay change (on the Pi)

```bash
cd ~/services/huskyhealth && git pull && docker compose up -d --build
```

## mitmweb (egress capture) for demos

The web UI listens on the Pi's `127.0.0.1:8091` only. Its login URL with token is in `docker compose logs egress`. Show the **Request body** tab, never the headers (they contain the API keys).
