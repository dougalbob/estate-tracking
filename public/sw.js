// Service worker for Estate Organiser.
// - Install + activate Claim so the PWA is installable (Chrome heuristic needs an active SW).
// - One POST handler for Web Share Target at /share-target.
//   Every other request is left to the network/Cloudflare Access (no caching, no offline).

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      await self.clients.claim();
      // Do not delete the share cache here: a share may have just been
      // stored and the client is still navigating through Access login.
      // Entries are deleted by the page once consumed; stale leftovers
      // are harmless (only the file the user just chose to share, on that phone).
    })(),
  );
});

// Cache name for inbound shares — nothing else ever uses this name.
var SHARE_CACHE = "estate-share-incoming";
var SHARE_PENDING = "/__share-incoming__/pending";
var SHARE_FILE_PREFIX = "/__share-incoming__/file-";

self.addEventListener("fetch", function (event) {
  var url;
  try {
    url = new URL(event.request.url);
  } catch (_) {
    return;
  }
  // Only handle the share-target POST. Every other request (including
  // POST /api/documents/upload) must go to the network unchanged so it
  // continues through Cloudflare Access.
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(
      (async function () {
        try {
          var formData = await event.request.formData();
          var rawFiles = formData.getAll("file");
          // formData may contain File entries plus title/text/url strings
          // if the manifest ever adds those — keep only Files.
          var files = [];
          for (var i = 0; i < rawFiles.length; i++) {
            var entry = rawFiles[i];
            // In SW context, File is a kind of Blob; instanceof File is the
            // most precise test but fallback to Blob with a name.
            if (entry instanceof File) files.push(entry);
            else if (
              entry &&
              typeof entry === "object" &&
              typeof entry.arrayBuffer === "function"
            ) {
              // Some browsers may give Blob without File subclass
              files.push(entry);
            }
          }

          var cache = await caches.open(SHARE_CACHE);
          // Clear any previous share left behind so a new share never mixes
          // with an older one. If nothing consumes this share, it is still
          // only the file the user just chose, on that phone — not on the server.
          var existing = await cache.keys();
          for (var k = 0; k < existing.length; k++) {
            var req = existing[k];
            // Only touch our own namespace
            if (req.url.indexOf("/__share-incoming__/") !== -1) {
              await cache.delete(req);
            }
          }

          var stored = 0;
          for (var j = 0; j < files.length; j++) {
            var file = files[j];
            // Preserve name and type in headers so the page can reconstruct a File
            var headers = new Headers();
            var name = file.name || "shared-file";
            var type = file.type || "application/octet-stream";
            headers.set("X-File-Name", name);
            headers.set("X-File-Type", type);
            headers.set("Content-Type", type);
            try {
              headers.set("Content-Length", String(file.size));
            } catch (_) {}
            var buffer = await file.arrayBuffer();
            await cache.put(
              SHARE_FILE_PREFIX + j,
              new Response(buffer, { headers: headers }),
            );
            stored++;
          }

          // Also store a small manifest so the page knows how many files
          // were in the original share (to say "others were ignored").
          try {
            await cache.put(
              SHARE_PENDING,
              new Response(
                JSON.stringify({
                  count: rawFiles.length,
                  stored: stored,
                  timestamp: Date.now(),
                }),
                { headers: { "Content-Type": "application/json" } },
              ),
            );
          } catch (_) {}
        } catch (e) {
          // Ensure we still redirect even if parsing failed; page will
          // notice an empty cache and show a plain message.
          try {
            var c = await caches.open(SHARE_CACHE);
            await c.put(
              SHARE_PENDING,
              new Response(
                JSON.stringify({ count: 0, stored: 0, error: String(e) }),
                { headers: { "Content-Type": "application/json" } },
              ),
            );
          } catch (_) {}
        }
        // 303 to a normal GET that carries the Access session cookie.
        // The workspace will look for this flag, consume the Cache entry,
        // and remove the flag from the address bar.
        return Response.redirect("/?share-target=1", 303);
      })(),
    );
  }
});
