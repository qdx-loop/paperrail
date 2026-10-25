/*
 * PaperRail service-worker kill switch.
 *
 * Earlier builds registered a cache-first worker that pinned hashed bundles
 * across deploys. This worker replaces it, clears every cache, unregisters
 * itself and reloads controlled clients once, so visitors always run the
 * current release. Registration is disabled in the app bundle.
 */
// Replaced at build time by the sw-precache plugin.
const PRECACHE_ASSETS = [];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .map((key) => caches.delete(key))
      );
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try {
          await client.navigate(client.url);
        } catch {
          /* ignore */
        }
      }
    })()
  );
});

self.addEventListener('fetch', () => {
  /* network only: never answer from cache */
});
