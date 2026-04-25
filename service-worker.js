const CACHE_PREFIX = "rb-taxi-vycetka-";
const CACHE_NAME = CACHE_PREFIX + "v3-6-45-obsidian-glass";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./calc.js",
  "./app.js",
  "./vendor/html2canvas.min.js",
  "./vendor/jspdf.umd.min.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./screenshot-wide.png",
  "./screenshot-mobile.png"
];

const NETWORK_FIRST_ASSETS = new Set([
  "/",
  "/index.html",
  "/style.css",
  "/calc.js",
  "/app.js",
  "/manifest.json",
  "/vendor/html2canvas.min.js",
  "/vendor/jspdf.umd.min.js",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const shouldUseNetworkFirst =
    event.request.mode === "navigate" ||
    [...NETWORK_FIRST_ASSETS].some((assetPath) => requestUrl.pathname.endsWith(assetPath));

  event.respondWith((async () => {
    if (shouldUseNetworkFirst) {
      try {
        const fresh = await fetch(event.request, { cache: "no-store" });
        if (fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, fresh.clone());
          if (event.request.mode === "navigate") await cache.put("./index.html", fresh.clone());
        }
        return fresh;
      } catch {
        return caches.match(event.request) || caches.match("./index.html");
      }
    }

    const cached = await caches.match(event.request);
    if (cached) return cached;

    const response = await fetch(event.request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
