---
type: memory
category: project
id: PROJECT-INFRA-001
tags:
  - infra
  - docker
  - nginx
  - relay
  - egress
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (section 10.2)
---

# Infra Files (Mac, in the repo)

Three containers on the Pi: `gateway` (nginx), `relay` (Flask/gunicorn), `egress` (mitmweb). Only the AI relay lives on the Pi; the PWA is on Cloudflare Pages.

## `docker-compose.yml`
```yaml
services:
  gateway:
    image: nginx:alpine
    ports: ["127.0.0.1:8090:80"]
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    networks: [front, internal]
    restart: unless-stopped

  relay:
    build: ./relay
    env_file: .env
    environment:
      ANTHROPIC_BASE_URL: http://egress:8080
      GRADIUM_BASE_URL: http://egress:8082
      HOME: /tmp
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 768m
    networks: [internal]
    restart: unless-stopped

  egress:
    image: mitmproxy/mitmproxy:latest
    command: mitmweb --mode reverse:https://api.anthropic.com@8080 --mode reverse:https://us.api.gradium.ai@8082 --web-host 0.0.0.0 --web-port 8091 --no-web-open-browser
    ports: ["127.0.0.1:8091:8091"]
    mem_limit: 256m
    networks: [internal, outbound]
    restart: unless-stopped

networks:
  front: {}
  outbound: {}
  internal:
    internal: true
```
- `internal: true` → the relay has no route to the internet except through `egress`.
- No ARM mitmproxy image → build one from `python:3.12-slim` with `pip install mitmproxy`.
- mitmweb token login URL: `docker compose logs egress`.
- Two `--mode` listeners need mitmproxy 10+. Swap `us.` for `eu.` for the EU region.

## `nginx/default.conf`
```nginx
# Only the AI relay lives on the Pi; the PWA is served by Cloudflare Pages.
map $http_origin $cors_origin {
    default "";
    "https://huskyhealth.vedsite.com" $http_origin;
    "https://huskyhealth.pages.dev" $http_origin;
    "~^https://[a-z0-9-]+\.huskyhealth\.pages\.dev$" $http_origin;
}

server {
    listen 80;
    access_log off;
    client_max_body_size 256k;

    location /v1/ {
        add_header Access-Control-Allow-Origin $cors_origin always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        add_header Access-Control-Allow-Methods "GET, POST, DELETE, OPTIONS" always;
        add_header Access-Control-Max-Age "600" always;
        add_header Vary "Origin" always;
        add_header Cache-Control "no-store" always;
        add_header X-Content-Type-Options "nosniff" always;
        if ($request_method = OPTIONS) { return 204; }
        proxy_pass http://relay:8000;
        proxy_set_header X-Forwarded-For "";
        proxy_set_header Forwarded "";
    }

    location / { return 404; }
}
```
- `client_max_body_size` is small on purpose: only small JSON, ≤ 5 s check-in audio and sync drops. The export never goes over the network.

## `relay/requirements.txt`
```
flask
gunicorn
pydantic>=2
anthropic
presidio-analyzer
cryptography
```

## `relay/Dockerfile`
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm
COPY . .
USER 10001
# ONE worker: tokens live in this process's RAM. Threads give concurrency.
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--bind", "0.0.0.0:8000", "app:app"]
```

## `.env.example` (committed; real `.env` made by hand per machine, never committed)
```
ANTHROPIC_API_KEY=
GRADIUM_API_KEY=
GRADIUM_VOICE_ID=
```

Plan writes each file as a paste-ready heredoc (`cat > <file> << 'EOF'`).
