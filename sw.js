// Garde l'app disponible même avec une connexion faible. Les données restent synchronisées par Firebase.
const CACHE = "agenda-a-deux-v53";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
// Bibliothèques externes à version fixe (Firebase, Leaflet) : gardées sur le téléphone, chargées instantanément
const LIBS = "together-libs-v1";
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== LIBS).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  // Fichier calendrier fabriqué à la volée : agenda.ics?d=<contenu>
  if (u.origin === location.origin && u.pathname.endsWith("/agenda.ics")) {
    const body = u.searchParams.get("d") || "";
    e.respondWith(new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "inline; filename=\"agenda-a-deux.ics\"", "Cache-Control": "no-store" } }));
    return;
  }
  if (e.request.method !== "GET") return;
  // Polices : le fichier de style est rafraîchi en arrière-plan, les polices elles-mêmes ne changent jamais
  if (u.hostname === "fonts.googleapis.com") {
    e.respondWith(caches.open(LIBS).then((c) => c.match(e.request).then((hit) => {
      const net = fetch(e.request).then((r) => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if (u.hostname === "fonts.gstatic.com" || (u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/")) || (u.hostname === "unpkg.com" && /@\d+\.\d+\.\d+/.test(u.pathname))) {
    e.respondWith(caches.open(LIBS).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (u.origin !== location.origin) return;
  // Le réseau d'abord pour avoir la dernière version, mais sans faire attendre : au-delà de 1,5 s, la copie du téléphone s'affiche
  e.respondWith((async () => {
    const net = fetch(e.request, { cache: "no-cache" }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; });
    const cached = await caches.match(e.request);
    if (!cached) return net.catch(() => caches.match("./index.html"));
    const r = await Promise.race([net.catch(() => null), new Promise((res) => setTimeout(() => res(null), 1500))]);
    return r || cached;
  })());
});

// Notifications reçues du serveur Together
// Toucher une notification ouvre directement ce dont elle parle : « ev-<id> » l'évènement, « trip-<id> » le trajet en direct
const urlFor = (d) => {
  if (d.url && d.url !== "./") return d.url;
  const m = /^(ev|fb|trip)-([A-Za-z0-9]{4,})/.exec(d.tag || "");
  return m ? "./?" + (m[1] === "trip" ? "trip" : "ev") + "=" + m[2] : "./";
};
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Together", { body: d.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: d.tag || undefined, renotify: !!d.tag, data: { url: urlFor(d) } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    // l'app est déjà ouverte en arrière-plan : on la ramène et on lui dit quoi montrer
    for (const c of cs) { if ("focus" in c) return c.focus().then((w) => (w || c).postMessage({ type: "open", url })).catch(() => c.postMessage({ type: "open", url })); }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
