/*
 * Bite service worker: an offline app shell. All user data already lives in
 * IndexedDB, so offline you can still open the app, view history, use the food
 * library and add entries manually. API calls (AI) are never cached.
 */
const VERSION = "bite-v3";
const SHELL = ["/", "/progress", "/coach", "/foods", "/week", "/settings", "/manifest.webmanifest", "/icons/icon-192.png"];
const MAX_ENTRIES = 250; // hashed build assets pile up across deploys; keep the newest

async function remember(req, res) {
  const cache = await caches.open(VERSION);
  await cache.put(req, res);
  const keys = await cache.keys();
  // Cache keys come back in insertion order: drop the oldest, never the app shell.
  const extra = keys.length - MAX_ENTRIES;
  if (extra > 0) {
    const shell = new Set(SHELL.map((p) => new URL(p, self.location.origin).href));
    await Promise.all(keys.filter((k) => !shell.has(k.url)).slice(0, extra).map((k) => cache.delete(k)));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache AI calls or user payloads

  // Pages and client-side navigation payloads (?_rsc=): network first so
  // updates land immediately; cached copy when offline.
  if (req.mode === "navigate" || url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) remember(req, res.clone());
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/") : Response.error()))),
    );
    return;
  }

  // Hashed build assets are immutable: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) remember(req, res.clone());
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else (icons, fonts): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) remember(req, res.clone()); // clone before the page consumes the body
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
