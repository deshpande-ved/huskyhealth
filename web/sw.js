// web/sw.js: app shell cached; works with no network; /v1/ never cached.
// SHELL grows per epic: each story adds the offline files it creates and bumps CACHE.
const CACHE = "huskyhealth-v5";
const SHELL = ["/", "/css/style.css", "/js/app.js", "/js/engine.js", "/js/features.js",
               "/js/parse-apple.worker.js", "/vendor/fflate.esm.js",
               "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) => {
  if (new URL(e.request.url).pathname.startsWith("/v1/")) return;   // AI relay: network only
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
