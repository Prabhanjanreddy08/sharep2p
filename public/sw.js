// ShareFast Offline & Low-Signal Service Worker
const CACHE_NAME = "sharefast-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Handle Zero-Memory IndexedDB streaming downloads
  if (url.pathname === "/sw-download") {
    const dbName = url.searchParams.get("db");
    const fileName = url.searchParams.get("name") || "download";
    const fileType = url.searchParams.get("type") || "application/octet-stream";
    const fileSize = url.searchParams.get("size");

    if (!dbName) {
      event.respondWith(new Response("Missing database parameter", { status: 400 }));
      return;
    }

    event.respondWith(
      new Promise((resolve) => {
        const req = indexedDB.open(dbName, 1);
        req.onerror = () => resolve(new Response("Failed to open storage", { status: 500 }));
        req.onsuccess = () => {
          const db = req.result;
          let tx = null;
          try {
            tx = db.transaction("chunks", "readonly");
          } catch (e) {
            return resolve(new Response("Store not found", { status: 500 }));
          }
          const store = tx.objectStore("chunks");

          const cursorReq = store.openCursor();
          const stream = new ReadableStream({
            start(controller) {
              cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                  controller.enqueue(cursor.value);
                  cursor.continue();
                } else {
                  controller.close();
                  try {
                    db.close();
                    indexedDB.deleteDatabase(dbName);
                  } catch {}
                }
              };
              cursorReq.onerror = () => {
                controller.error(cursorReq.error);
                try { db.close(); } catch {}
              };
            }
          });

          const headers = new Headers();
          headers.set("Content-Type", fileType);
          headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
          if (fileSize) {
            headers.set("Content-Length", fileSize);
          }

          resolve(new Response(stream, { headers }));
        };
      })
    );
    return;
  }

  // Do not cache API or WebSocket requests
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws")) {
    return;
  }

  // Network-first with cache fallback for navigation, cache-first for static assets
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/") || caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => null);
    })
  );
});
