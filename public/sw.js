// Minimal no-op service worker.
// Registers so the PWA is installable on Android (Chrome's installability
// heuristic wants an active service worker), but performs NO caching and adds
// NO fetch handling. Every request still goes to the network/origin (Cloudflare
// Access), so nothing is served offline and no app data can leak via the SW.
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});
