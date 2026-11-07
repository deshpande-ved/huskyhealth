#!/usr/bin/env bash
# scripts/check-pages.sh <base-url>: verify a deployed HuskyHealth PWA.
# Checks: served CSP equals web/_headers; connect-src is only 'self' + relay;
# every SHELL path in web/sw.js returns 200; /sw.js is no-cache;
# /version.txt matches origin/staging. Exits non-zero on any failure.
set -uo pipefail

BASE="${1:-}"
if [ -z "$BASE" ]; then echo "usage: $0 <base-url>" >&2; exit 2; fi
BASE="${BASE%/}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELAY="https://veds-pi5.polecat-nominal.ts.net:10000"
fail=0
bad() { echo "FAIL: $*" >&2; fail=1; }

expected_csp="$(grep -m1 'Content-Security-Policy:' "$ROOT/web/_headers" | sed 's/^ *Content-Security-Policy: *//')"
served_csp="$(curl -sI "$BASE/" | tr -d '\r' | grep -i '^content-security-policy:' | sed 's/^[^:]*: *//')"

if [ -z "$served_csp" ]; then
  bad "no content-security-policy header at $BASE/"
elif [ "$served_csp" != "$expected_csp" ]; then
  bad "CSP differs from web/_headers"
  echo "  served:   $served_csp" >&2
  echo "  expected: $expected_csp" >&2
else
  echo "ok: CSP matches web/_headers"
fi

connect="$(printf '%s' "$served_csp" | tr ';' '\n' | grep -E '^ *connect-src ' | sed 's/^ *connect-src *//')"
if [ -n "$served_csp" ]; then
  for src in $connect; do
    case "$src" in
      "'self'"|"$RELAY") ;;
      *) bad "connect-src lists unexpected source: $src" ;;
    esac
  done
  [ "$fail" = 0 ] && echo "ok: connect-src is 'self' + relay only"
fi

sw_cc="$(curl -sI "$BASE/sw.js" | tr -d '\r' | grep -i '^cache-control:' | sed 's/^[^:]*: *//')"
if printf '%s' "$sw_cc" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -qx 'no-cache'; then
  echo "ok: /sw.js cache-control includes no-cache"
else
  bad "/sw.js cache-control lacks no-cache (got: '${sw_cc}')"
fi

shell_paths="$(sed -n '/const SHELL/,/];/p' "$ROOT/web/sw.js" | grep -oE '"/[^"]*"' | tr -d '"')"
for p in $shell_paths; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"
  if [ "$code" = "200" ]; then echo "ok: $p 200"; else bad "$p returned $code"; fi
done

served_ver="$(curl -s "$BASE/version.txt" | tr -d '[:space:]')"
git -C "$ROOT" fetch -q origin staging 2>/dev/null || true
staging_ver="$(git -C "$ROOT" rev-parse origin/staging 2>/dev/null || true)"
echo "version.txt:    ${served_ver:0:7}"
echo "origin/staging: ${staging_ver:0:7}"
if [ -z "$served_ver" ] || [ "${served_ver:0:7}" != "${staging_ver:0:7}" ]; then
  bad "deployed version does not match origin/staging"
fi

if [ "$fail" = 0 ]; then echo "PASS"; else echo "FAILED" >&2; fi
exit "$fail"
