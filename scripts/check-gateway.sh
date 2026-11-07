#!/usr/bin/env bash
# scripts/check-gateway.sh <base-url>: healthz, 404 outside /v1/, preflight, exact CORS. Exits non-zero on failure.
set -uo pipefail
B="${1:?usage: $0 <base-url>}"; B="${B%/}"; fail=0
bad() { echo "FAIL: $*" >&2; fail=1; }
ok() { echo "ok: $*"; }
body="$(curl -s "$B/v1/healthz")"; [ "$body" = "ok" ] && ok "/v1/healthz -> ok" || bad "/v1/healthz returned '$body'"
for p in / /healthz /anything; do c="$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; [ "$c" = 404 ] && ok "$p -> 404" || bad "$p -> $c"; done
pre="$(curl -s -o /dev/null -D - -X OPTIONS "$B/v1/brief" | tr -d '\r')"
echo "$pre" | head -1 | grep -q " 204" && ok "OPTIONS /v1/brief -> 204" || bad "OPTIONS /v1/brief not 204"
echo "$pre" | grep -qi '^cache-control: no-store' && ok "no-store" || bad "preflight lacks Cache-Control: no-store"
acao() { curl -s -o /dev/null -D - -H "Origin: $1" "$B/v1/healthz" | tr -d '\r' | grep -i '^access-control-allow-origin:' | sed 's/^[^:]*: *//'; }
for o in https://huskyhealth.vedsite.com https://huskyhealth.pages.dev https://feat-x.huskyhealth.pages.dev; do
  [ "$(acao "$o")" = "$o" ] && ok "CORS allows $o" || bad "CORS does not echo $o"; done
for o in https://evil.example https://huskyhealth.pages.dev.evil.example http://huskyhealth.pages.dev null; do
  [ -z "$(acao "$o")" ] && ok "CORS refuses $o" || bad "CORS allowed $o"; done
[ "$fail" = 0 ] && echo PASS || echo FAILED >&2
exit "$fail"
