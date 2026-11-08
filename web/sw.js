// web/sw.js: app shell cached; works with no network; /v1/ never cached.
// SHELL grows per epic: each story adds the offline files it creates and bumps CACHE.
const CACHE = "huskyhealth-v45";
const SHELL = ["/", "/css/style.css", "/js/app.js", "/js/engine.js", "/js/features.js",
               "/js/ascii.js", "/js/view.js", "/js/db.js",
               "/js/box.js", "/js/sync-merge.js", "/js/account.js", "/js/vault.js", "/js/voice.js",
               "/js/parse-apple.worker.js", "/vendor/fflate.esm.js",
               "/api", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png",
               "/fonts/space-mono-latin-400-normal.woff2", "/fonts/space-mono-latin-700-normal.woff2",
               "/favicon.ico", "/favicon.svg", "/icons/favicon-96x96.png", "/art/husky.svg", "/art/husky-mark.svg", "/art/husky-bright.svg"];

// A new version takes over at once (no waiting for every tab to close); the page reloads itself once (app.js).
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting?.())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients?.claim())));
self.addEventListener("fetch", (e) => {
  if (new URL(e.request.url).pathname.startsWith("/v1/")) return;   // AI relay: network only
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
