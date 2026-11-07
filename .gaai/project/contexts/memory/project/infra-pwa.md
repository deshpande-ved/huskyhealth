---
type: memory
category: project
id: PROJECT-INFRA-003
tags:
  - pwa
  - web
  - service-worker
  - offline
  - voice
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (section 10.4)
---

# The PWA (`web/`)

## `manifest.webmanifest`
```json
{
  "name": "HuskyHealth",
  "short_name": "HuskyHealth",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#191724",
  "theme_color": "#191724",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```
`index.html` also has `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` and a `theme-color` meta.

## `sw.js` — app shell cached; works with no network; `/v1/` never cached
```js
// web/sw.js
const CACHE = "huskyhealth-v1";               // bump on every deploy
const SHELL = ["/", "/index.html", "/r.html", "/css/style.css", "/js/app.js", "/js/engine.js",
               "/js/features.js", "/js/db.js", "/js/ascii.js", "/js/voice.js", "/js/box.js",
               "/js/parse-apple.worker.js", "/js/parse-fit.worker.js",
               "/vendor/fflate.esm.js", "/vendor/fitsdk/index.js",
               "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) => {
  if (new URL(e.request.url).pathname.startsWith("/v1/")) return;   // AI relay: network only
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
```
- SHELL grows per epic (Ved, 2026-11-07): E01 ships only the shell's own files; each later story adds the offline files it creates, and any story that changes a SHELL file bumps `CACHE`. The list above is the eventual target. Manifest colours use Rosé Pine base `#191724`.
- fitsdk spans several files: add each file under `/vendor/fitsdk/` to `SHELL`, or Garmin import fails offline.

## Import — `<input type="file" accept=".zip,.xml,.fit" multiple>` starts the right module worker
```js
// web/js/app.js (import)
document.getElementById("import").addEventListener("change", (e) => {
  const files = [...e.target.files];
  const fit = files.length && files.every((f) => f.name.toLowerCase().endsWith(".fit"));
  const worker = new Worker(fit ? "/js/parse-fit.worker.js" : "/js/parse-apple.worker.js", { type: "module" });
  worker.onmessage = ({ data }) => {
    if (data.progress) showProgress(data.progress);
    if (data.done) { worker.terminate(); saveFeatures(data.features); render(score(data.features)); }
  };
  worker.postMessage(fit ? { files } : { file: files[0], days: 60 });
});
```

## `db.js`
- IndexedDB keeps only the features JSON and results. Visible line: "Stored on this phone: 60 days of summaries". **Forget everything** deletes the database.
- Treat it as a cache: iOS may clear website data; re-importing restores it.

## Rules
- No inline CSS or JS (CSP enforces it). `textContent`, never `innerHTML`, for anything from the network.
- System fonts. Vendored libraries only (pinned versions; licenses kept next to them).

## Voice (`r.js` / `voice.js`)
```js
// web/js/voice.js: Gradium audio from memory only, or the phone's own voice
export async function readAloud(text, speakToken, playButton) {
  const res = await fetch("/v1/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${speakToken}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`speak failed: ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  try {
    await audio.play();
  } catch {
    playButton.hidden = false;                    // Safari may block autoplay after the fetch
    playButton.addEventListener("click", () => audio.play(), { once: true });
  }
}

export function phoneVoice(text) {
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));   // on-device; works in airplane mode
}
```
