// Ancien module hors connexion : il servait parfois une copie périmée du site.
// Cette version efface ses copies et se désinstalle ; le site se charge toujours depuis le réseau.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
  })());
});
