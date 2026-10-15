// Garde l'app disponible même avec une connexion faible. Les données restent synchronisées par Firebase.
const CACHE = "agenda-a-deux-v12";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  // Fichier calendrier fabriqué à la volée : agenda.ics?d=<contenu>
  if (u.origin === location.origin && u.pathname.endsWith("/agenda.ics")) {
    const body = u.searchParams.get("d") || "";
    e.respondWith(new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "inline; filename=\"agenda-a-deux.ics\"", "Cache-Control": "no-store" } }));
    return;
  }
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
