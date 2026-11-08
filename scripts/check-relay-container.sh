#!/usr/bin/env bash
# scripts/check-relay-container.sh: run on the machine with the compose stack (Mac or Pi), from the repo root.
# Prints readonly/mounts/workers/caps for the relay and checks it can only reach the internet via egress.
set -uo pipefail
fail=0
id="$(docker compose ps -q relay)"; [ -n "$id" ] || { echo "relay is not running" >&2; exit 1; }
ro="$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$id")"
mounts="$(docker inspect -f '{{range .Mounts}}{{.Destination}} {{end}}' "$id" | xargs)"   # only the account vaults (ciphertext)
caps="$(docker inspect -f '{{.HostConfig.CapDrop}}' "$id")"
procs="$(docker compose top relay | grep -c gunicorn)"
nets="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$id")"
workers=$(( procs - 1 ))
capstr=$([ "$caps" = "[ALL]" ] && echo none || echo "$caps")
echo "readonly=$ro mounts=$mounts workers=$workers caps=$capstr networks=$nets"
[ "$ro" = true ] && [ "$mounts" = /data/vaults ] && [ "$workers" = 1 ] && [ "$capstr" = none ] || fail=1
case "$nets" in *internal*) ;; *) fail=1 ;; esac
[ "$(echo $nets | wc -w | tr -d ' ')" = 1 ] || { echo "relay is on more than one network" >&2; fail=1; }
if docker compose exec -T relay python -c "import urllib.request; urllib.request.urlopen('https://api.anthropic.com', timeout=5)" >/dev/null 2>&1; then
  echo "FAIL: relay reached the internet directly" >&2; fail=1; else echo "ok: no direct internet from relay"; fi
docker compose exec -T relay python -c "import socket; socket.gethostbyname('egress')" >/dev/null 2>&1 && echo "ok: egress resolves" || { echo "FAIL: egress does not resolve" >&2; fail=1; }
grep -q "access_log off" nginx/default.conf && grep -q 'X-Forwarded-For ""' nginx/default.conf && echo "ok: gateway logs nothing, strips X-Forwarded-For" || fail=1
[ "$fail" = 0 ] && echo PASS || echo FAILED >&2
exit "$fail"
