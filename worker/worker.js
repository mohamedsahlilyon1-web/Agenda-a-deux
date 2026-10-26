// Together : serveur de notifications (Cloudflare Workers, gratuit).
// Déploiement : 2026-10-26 (carte 3D : l'itinéraire avec les bouchons)
// Envoie les notifications Web Push aux iPhone, garde les rappels programmés
// et publie pour chacun un calendrier .ics auquel l'iPhone s'abonne.
const ORIGIN_OK = (o) => !o || /^https:\/\/mohamedsahlilyon1-web\.github\.io$/i.test(o) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(o);
const SUBJECT = "https://mohamedsahlilyon1-web.github.io/Agenda-a-deux/";
const enc = new TextEncoder();
const b64u = (buf) => { const b = new Uint8Array(buf); let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (s) => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const concat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

async function vapidKeys(env) {
  let v = await env.KV.get("vapid", "json");
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    v = { jwk, pub }; await env.KV.put("vapid", JSON.stringify(v));
  }
  return v;
}
async function vapidHeader(env, endpoint) {
  const v = await vapidKeys(env);
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const aud = new URL(endpoint).origin;
  const h = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const p = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(h + "." + p));
  return "vapid t=" + h + "." + p + "." + b64u(sig) + ", k=" + v.pub;
}
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
// Chiffrement RFC 8291 (aes128gcm)
async function encryptPayload(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
// « Topic » : Apple refuse (400 BadWebPushTopic) une étiquette dont la longueur n'est pas valide en base64url
// (« trip-<id> » faisait 25 caractères). On envoie donc toujours 16 caractères tirés de l'étiquette.
async function topicOf(tag) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(tag))));
  return b64u(h).slice(0, 16);
}
async function sendPush(env, sub, msg) {
  const body = await encryptPayload(sub, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, { method: "POST", body, headers: {
    "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high",
    ...(msg.tag ? { Topic: await topicOf(msg.tag) } : {}),
    Authorization: await vapidHeader(env, sub.endpoint) } });
  let reason = "";
  if (r.status >= 400) { try { const j = await r.json(); reason = String((j && j.reason) || "").slice(0, 40); } catch (_) {} }
  return { st: r.status, reason };
}
async function sendTo(env, subs, uids, msg) {
  let changed = false, sent = 0;
  const codes = [];
  for (const uid of uids) {
    const list = subs[uid] || [];
    const keep = [];
    if (!list.length) codes.push({ to: String(uid).slice(0, 8), st: -1 }); // aucun abonnement pour ce téléphone
    for (const s of list) {
      let st = 0, rs = ""; try { const x = await sendPush(env, s, msg); st = x.st; rs = x.reason; } catch (e) { st = 0; rs = String(e && e.message || e).slice(0, 40); }
      codes.push({ to: String(uid).slice(0, 8), st, ...(rs ? { rs } : {}) });
      if (st === 404 || st === 410) { changed = true; continue; }
      if (st >= 200 && st < 300) sent++;
      keep.push(s);
    }
    if (keep.length !== list.length) subs[uid] = keep;
  }
  return { changed, sent, codes };
}
// Journal des derniers envois (type, destinataire abrégé, réponse du service d'Apple) : pour comprendre une notification perdue
async function logSends(env, id, kind, entries) {
  if (!entries || !entries.length) return;
  const L = (await env.KV.get("l:" + id, "json")) || [], at = Date.now();
  for (const c of entries) L.push({ at, k: kind, t: String(c.tag || "").split("-")[0].slice(0, 12), to: c.to, st: c.st, ...(c.rs ? { rs: c.rs } : {}) });
  await env.KV.put("l:" + id, JSON.stringify(L.slice(-40)));
}
const cors = (req) => ({ "Access-Control-Allow-Origin": ORIGIN_OK(req.headers.get("Origin")) ? (req.headers.get("Origin") || "*") : "null",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" });
const json = (req, o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) } });
const clean = (s, n) => String(s || "").slice(0, n || 200);

async function getCouple(env, id) { return (await env.KV.get("c:" + id, "json")) || null; }
async function putCouple(env, id, c) { await env.KV.put("c:" + id, JSON.stringify(c)); }
async function addIndex(env, id) { const idx = (await env.KV.get("index", "json")) || []; if (!idx.includes(id)) { idx.push(id); await env.KV.put("index", JSON.stringify(idx)); } }
// Chaque type de donnée a sa propre clé : un envoi de rappels ne peut plus effacer un abonnement tout juste ajouté
// (KV ne garantit pas qu'une lecture voit l'écriture faite une seconde plus tôt ailleurs).
async function getSubs(env, id, c) { return (await env.KV.get("s:" + id, "json")) || (c && c.subs) || {}; }
async function putSubs(env, id, subs) { await env.KV.put("s:" + id, JSON.stringify(subs)); }
async function getWidgets(env, id, c) { return (await env.KV.get("w:" + id, "json")) || { at: (c && c.wAt) || 0, map: (c && c.widgets) || {} }; }
async function putWidgets(env, id, w) { await env.KV.put("w:" + id, JSON.stringify(w)); }
async function getDone(env, id, c) { return (await env.KV.get("d:" + id, "json")) || (c && c.done) || []; }
async function putDone(env, id, d) { await env.KV.put("d:" + id, JSON.stringify(d.slice(-300))); }
// Calendrier Together : une clé de lecture seule tirée du jeton (le lien du calendrier ne permet rien d'autre)
const CAL_EMPTY = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Together//Agenda a deux//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
  "X-WR-CALNAME:Together", "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M", "END:VCALENDAR", ""].join("\r\n");
async function calKey(token) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("together-cal:" + token)));
  let s = ""; for (const x of h) s += x.toString(16).padStart(2, "0"); return s.slice(0, 32);
}
async function getCals(env, id) { const k = await env.KV.get("k:" + id, "json"); return k && k.map ? k : { at: 0, map: {} }; }
// Ajout depuis Siri ou le menu Partager (raccourci de l'iPhone) : /add/<couple>/<personne>/<clé>.
// La clé est propre à chaque personne et ne permet que de proposer un ajout : rien ne s'enregistre sans la fiche vérifiée dans l'app.
async function addKey(token, uid) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("together-add:" + token + ":" + uid)));
  let s = ""; for (const x of h) s += x.toString(16).padStart(2, "0"); return s.slice(0, 24);
}
const txt = (t, st) => new Response(t, { status: st || 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
// Ce que fait l'un et que l'autre reçoit : gardé une minute pour regrouper plusieurs ajouts d'affilée en une notification,
// et gardé jusqu'à 7 h pour qui a choisi « Ne pas déranger la nuit » (clé h:<couple>)
function quietNow(p, now) {
  if (!p || !p.quiet) return false;
  // (« fr-FR » écrirait « 01 h » : on lit l'heure seule, en 0-23)
  let h = 12; try { h = +new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: p.tz || "Europe/Paris" }).format(new Date(now)) % 24; } catch (_) {}
  if (!Number.isFinite(h)) h = 12;
  return h >= 22 || h < 7;
}
function mergeHeld(list) {
  if (list.length === 1) { const x = list[0]; return { title: x.title, body: x.body, tag: x.tag, url: x.url }; }
  const M = list.map((x) => x.meta || null), who = M[0] && M[0].who, same = !!who && M.every((m) => m && m.who === who);
  const adds = M.filter((m) => m && m.k === "add").length, shops = M.filter((m) => m && m.k === "shop").length;
  // que des ajouts à la liste de courses : « Hajjour a ajouté à la liste » / « Lait, Œufs, Pain »
  if (same && shops === list.length) return { title: clean(who + " a ajouté à la liste", 120), body: clean([...new Set(M.map((m) => m.t).join(", ").split(", "))].join(", "), 300), tag: "shop", url: "./?shop=1" };
  const title = same ? (adds === list.length ? who + " a ajouté " + list.length + " évènements" : who + " a fait " + list.length + " changements") : list.length + " nouveautés dans Together";
  const body = list.map((x, i) => { const m = M[i]; if (!m || !m.t) return x.title;
    if (m.k === "shop") return "liste : " + m.t;
    return m.k === "add" ? "« " + m.t + " »" + (m.when ? " " + m.when : "") : (m.k === "del" ? "supprimé « " : "modifié « ") + m.t + " »"; }).join(", ");
  return { title: clean(title, 120), body: clean(body, 300), tag: "ev", url: "./" };
}
async function flushHeld(env, id, c, now) {
  const H = await env.KV.get("h:" + id, "json"); if (!Array.isArray(H) || !H.length) return;
  const byU = {}, keep = [], codes = [];let subs = null, changed = false;
  for (const x of H) if (x && x.u) (byU[x.u] = byU[x.u] || []).push(x);
  for (const [u, list] of Object.entries(byU)) {
    const ats = list.map((x) => +x.at || 0), newest = Math.max(...ats), oldest = Math.min(...ats);
    const ready = !quietNow((c.prefs || {})[u], now) && (now - newest >= 60000 || now - oldest >= 5 * 60000);
    if (!ready) { keep.push(...list); continue; }
    const msg = mergeHeld(list.slice(-12));
    subs = subs || await getSubs(env, id, c);
    const r = await sendTo(env, subs, [u], msg); changed = changed || r.changed;
    for (const cd of r.codes) codes.push({ ...cd, tag: msg.tag });
  }
  if (keep.length) await env.KV.put("h:" + id, JSON.stringify(keep.slice(-60))); else await env.KV.delete("h:" + id);
  if (changed && subs) await putSubs(env, id, subs);
  try { await logSends(env, id, "h", codes); } catch (_) {}
}
async function getAdds(env, id) { const a = await env.KV.get("a:" + id, "json"); return (Array.isArray(a) ? a : []).filter((x) => x && x.id && Date.now() - (+x.at || 0) < 3 * 86400000); }
async function putAdds(env, id, a) { if (a.length) await env.KV.put("a:" + id, JSON.stringify(a.slice(-20)), { expirationTtl: 3 * 86400 }); else await env.KV.delete("a:" + id); }
// Liens courts de Plans ou de Google Maps partagés : on les déplie pour que l'app lise le nom et l'adresse
async function expandLinks(t) {
  const re = /https?:\/\/(?:maps\.apple\/p\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)[^\s]+/g;
  const found = [...new Set(t.match(re) || [])].slice(0, 2);
  for (const u of found) {
    try {
      let cur = u;
      for (let i = 0; i < 4; i++) {
        const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }, ...(AbortSignal.timeout ? { signal: AbortSignal.timeout(4000) } : {}) });
        const loc = r.headers.get("Location");
        if (!loc || r.status < 300 || r.status >= 400) break;
        cur = new URL(loc, cur).toString();
      }
      if (cur !== u && /^https:\/\//.test(cur)) t = t.split(u).join(cur.slice(0, 600));
    } catch (_) {}
  }
  return t;
}
const UID_RE = /^[A-Za-z0-9_-]{1,80}$/;
// « Tout marche ? » et « Appareils » : un abonnement aux notifications est désigné par une empreinte courte, jamais par son adresse
async function epHash(ep) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("together-ep:" + ep)));
  let s = ""; for (const x of h.slice(0, 6)) s += x.toString(16).padStart(2, "0"); return s;
}
// ---------- Trafic en direct : une clé gratuite TomTom, collée une fois dans l'app (clé tk:<couple>) ----------
// Une heure avant chaque départ en voiture, le trajet est recalculé avec le trafic réel ; 20 min avant, une seconde fois.
// S'il s'allonge, ceux qui partent sont prévenus, et l'alerte « C'est l'heure de partir » arrive d'autant plus tôt.
const TT_TEST = [{ lat: 43.6086, lon: 3.8797 }, { lat: 43.6117, lon: 3.8767 }];
const ptOf = (p) => (p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lon) <= 180 ? { lat: +(+p.lat).toFixed(5), lon: +(+p.lon).toFixed(5) } : null);
async function ttDrive(key, pts, dep, now) {
  const loc = pts.map((p) => p.lat.toFixed(5) + "," + p.lon.toFixed(5)).join(":");
  const when = dep && dep > now + 60000 ? new Date(dep).toISOString().replace(/\.\d{3}Z$/, "Z") : "now";
  const u = "https://api.tomtom.com/routing/1/calculateRoute/" + loc + "/json?key=" + encodeURIComponent(key) +
    "&traffic=true&travelMode=car&routeType=fastest&routeRepresentation=summaryOnly&computeTravelTimeFor=all&departAt=" + encodeURIComponent(when);
  let r; try { r = await fetch(u, { headers: { Accept: "application/json" } }); } catch (_) { return { ok: false, st: 0 }; }
  if (!r.ok) return { ok: false, st: r.status };
  let j = null; try { j = await r.json(); } catch (_) {}
  const sm = j && j.routes && j.routes[0] && j.routes[0].summary;
  if (!sm || !(+sm.travelTimeInSeconds > 0)) return { ok: false, st: 0 };
  return { ok: true, min: sm.travelTimeInSeconds / 60, free: (+sm.noTrafficTravelTimeInSeconds || 0) / 60, km: (+sm.lengthInMeters || 0) / 1000 };
}
// l'itinéraire complet avec ses portions de trafic (pour colorer les bouchons sur la carte de l'app)
async function ttRoute(key, pts, now) {
  const loc = pts.map((p) => p.lat.toFixed(5) + "," + p.lon.toFixed(5)).join(":");
  const u = "https://api.tomtom.com/routing/1/calculateRoute/" + loc + "/json?key=" + encodeURIComponent(key) +
    "&traffic=true&travelMode=car&routeType=fastest&routeRepresentation=polyline&sectionType=traffic&computeTravelTimeFor=all&departAt=now";
  let r; try { r = await fetch(u, { headers: { Accept: "application/json" } }); } catch (_) { return { ok: false, st: 0 }; }
  if (!r.ok) return { ok: false, st: r.status };
  let j = null; try { j = await r.json(); } catch (_) {}
  const R = j && j.routes && j.routes[0], sm = R && R.summary;
  if (!R || !sm || !(+sm.travelTimeInSeconds > 0)) return { ok: false, st: 0 };
  const all = [];
  for (const L of R.legs || []) for (const q of L.points || []) if (Number.isFinite(+q.latitude) && Number.isFinite(+q.longitude)) all.push([Math.round(q.longitude * 1e5) / 1e5, Math.round(q.latitude * 1e5) / 1e5]);
  if (all.length < 2) return { ok: false, st: 0 };
  // au plus 600 points (un sur k), les portions de trafic suivent la même réduction
  const k = Math.max(1, Math.ceil(all.length / 600)), pts2 = all.filter((_, i) => i % k === 0 || i === all.length - 1);
  const ix = (i) => Math.min(pts2.length - 1, Math.round(Math.max(0, +i || 0) / k));
  const sec = (R.sections || []).filter((x) => x && x.sectionType === "TRAFFIC").slice(0, 80)
    .map((x) => ({ a: ix(x.startPointIndex), b: ix(x.endPointIndex), m: Math.max(0, Math.min(4, Math.round(+x.magnitudeOfDelay || 0))), c: String(x.simpleCategory || "").slice(0, 16), d: Math.round(+x.delayInSeconds || 0) }))
    .filter((x) => x.b > x.a);
  return { ok: true, pts: pts2, sec, min: Math.round(sm.travelTimeInSeconds / 6) / 10, free: Math.round((+sm.noTrafficTravelTimeInSeconds || sm.travelTimeInSeconds) / 6) / 10, km: Math.round((+sm.lengthInMeters || 0) / 100) / 10 };
}
// un trajet suivi, tel que l'app l'envoie (départ, durée prévue, coordonnées, qui part, qui est récupéré en chemin)
function cleanWatch(x, now) {
  if (!x || typeof x !== "object") return null;
  const w = { id: clean(x.id, 60), t: clean(x.t, 60), l: clean(x.l, 60), s: +x.s || 0, dep: +x.dep || 0, min: Math.max(0, Math.min(600, +x.min || 0)),
    wt: Math.max(0, Math.min(60, +x.wt || 0)), pm: Math.max(0, Math.min(600, +x.pm || 0)), f: ptOf(x.f), d: ptOf(x.d), v: ptOf(x.v),
    to: (Array.isArray(x.to) ? x.to : []).map((u) => clean(u, 80)).filter((u) => UID_RE.test(u)).slice(0, 2),
    pw: clean(x.pw, 80), dn: clean(x.dn, 30), tz: clean(x.tz, 40) };
  return w.id && w.f && w.d && w.dep > now - 3600000 && w.dep < now + 9 * 86400000 && w.min > 0 && w.to.length ? w : null;
}
// la durée prévue au volant (sans les 5 min pour se garer ni l'attente chez l'autre), et le seuil d'alerte
const ttPlan = (x) => Math.max(1, x.min - 5 - (x.v ? x.wt : 0));
const ttThr = (x) => Math.max(5, Math.round(ttPlan(x) * 0.15));
async function ttCheck(key, x, now) {
  const r = await ttDrive(key, x.v ? [x.f, x.v, x.d] : [x.f, x.d], x.dep, now);
  if (!r.ok) return r;
  return { ok: true, drive: r.min, d: Math.round(r.min - ttPlan(x)) };
}
function ttDue(x, r, now) {
  const rr = r && r.dep === x.dep ? r : null, k = rr ? +rr.k || 0 : 0;
  if (now > x.dep - 3 * 60000) return false;
  if (k === 0) return now >= x.dep - 65 * 60000;
  if (k === 1) return now >= x.dep - 25 * 60000 && now - (+rr.at || 0) >= 15 * 60000;
  return false;
}
const hmTz = (ms, tz) => { try { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz || "Europe/Paris" }).format(new Date(ms)).replace(/\s/g, ""); } catch (_) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(ms)).replace(/\s/g, ""); } };
// Ce que reçoit chacun quand ça bouchonne
function ttMsgs(x, d, drive) {
  const out = [], tz = x.tz || "Europe/Paris", dep2 = x.dep - d * 60000, what = x.t ? " pour « " + x.t + " »" : "";
  for (const u of x.to) {
    if (x.v && x.pw && u === x.pw) {
      const pk = x.dep + x.pm * 60000;
      out.push({ to: [u], title: (x.dn || "On") + " passera te prendre vers " + hmTz(pk - d * 60000, tz), body: "Trafic : +" + d + " min. Au lieu de " + hmTz(pk, tz) + (x.t ? ", pour « " + x.t + " »" : "") + ". Prépare-toi un peu plus tôt.", tag: "tf-" + x.id, url: "./?ev=" + x.id });
    } else {
      out.push({ to: [u], title: "Trafic : pars à " + hmTz(dep2, tz) + what, body: "Le trajet prend " + Math.round(drive) + " min au lieu de " + Math.round(ttPlan(x)) + " (+" + d + " min)" + (x.l ? ", vers " + x.l : "") + ".", tag: "tf-" + x.id, url: "./?ev=" + x.id });
    }
  }
  return out;
}
// Chaque minute : les trajets à vérifier maintenant
async function trafficTick(env, id, c, now) {
  const W = Array.isArray(c.watch) ? c.watch : [];
  if (!W.some((x) => now >= x.dep - 65 * 60000 && now <= x.dep - 3 * 60000)) return;
  const TF = (await env.KV.get("tf:" + id, "json")) || {};
  const dueW = W.filter((x) => ttDue(x, TF[x.id], now)).slice(0, 3);
  if (!dueW.length) return;
  const K = await env.KV.get("tk:" + id, "json"); if (!K || !K.k) return;
  let subs = null, subsChanged = false; const codes = [];
  for (const x of dueW) {
    const prev = TF[x.id] && TF[x.id].dep === x.dep ? TF[x.id] : null, k = (prev ? +prev.k || 0 : 0) + 1;
    const r = await ttCheck(K.k, x, now);
    if (!r.ok) { TF[x.id] = { ...(prev || {}), dep: x.dep, s: x.s, k, at: now, err: r.st || 1 }; continue; }
    const rec = { dep: x.dep, s: x.s, d: r.d, m: Math.round(r.drive), k, at: now, sent: prev ? +prev.sent || 0 : 0, al: r.d >= ttThr(x) ? 1 : 0 };
    if (rec.al && r.d >= rec.sent + 5) {
      if (!subs) subs = await getSubs(env, id, c);
      for (const m of ttMsgs(x, r.d, r.drive)) { const s2 = await sendTo(env, subs, m.to, m); subsChanged = subsChanged || s2.changed; for (const cd of s2.codes) codes.push({ ...cd, tag: m.tag }); }
      rec.sent = r.d;
    }
    TF[x.id] = rec;
  }
  for (const k of Object.keys(TF)) if (!(+TF[k].dep > now - 3 * 3600000)) delete TF[k];
  await env.KV.put("tf:" + id, JSON.stringify(TF));
  if (subsChanged) await putSubs(env, id, subs);
  if (codes.length) { try { await logSends(env, id, "t", codes); } catch (_) {} }
}
// Le widget et Siri en voiture voient l'heure de départ avancée quand ça bouchonne
async function tfShift(env, id, items) {
  if (!Array.isArray(items) || !items.length) return items;
  const TF = await env.KV.get("tf:" + id, "json"); if (!TF) return items;
  const now = Date.now(); let any = false;
  const out = items.map((x) => { const r = x && TF[x.id]; if (!r || !r.al || !(+x.d > 0) || r.s !== x.s || now > r.dep + 30 * 60000) return x; any = true; return { ...x, d: x.d - r.d * 60000, tf: r.d }; });
  return any ? out : items;
}
// Les anciens téléphones retirés dans l'app (« Appareils et sécurité ») : leurs liens (widget, Siri, voiture) ne répondent plus
const goneOf = (c) => (c && Array.isArray(c.gone) ? c.gone : []);
// Dernière utilisation du widget (w), de Siri (a) et des raccourcis de la voiture (c), pour « Tout marche ? ».
// Notée au plus toutes les 3 h (ou quand la version du widget change) : peu d'écritures.
async function noteUse(env, ctx, id, uid, kind, v) {
  if (!uid || !UID_RE.test(uid)) return;
  const key = "us:" + id, U = (await env.KV.get(key, "json")) || {}, now = Date.now(), o = U[uid] || {}, prev = o[kind];
  const at = prev && typeof prev === "object" ? +prev.at || 0 : +prev || 0, pv = prev && typeof prev === "object" ? prev.v || "" : "";
  if (now - at < 3 * 3600000 && !(v && pv !== v)) return;
  U[uid] = { ...o, [kind]: v ? { at: now, v } : now };
  const p = env.KV.put(key, JSON.stringify(U));
  if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
}
// Les pages de recettes (Marmiton, 750g…) publient leurs ingrédients en données « Recipe » (schema.org) :
// on les lit pour l'app, qui ne peut pas ouvrir ces pages elle-même
const RECIPE_URL = /(?:^|\.)(?:marmiton\.org|750g\.com|cuisineaz\.com|ptitchef\.com|chefsimon\.com|jow\.fr|hellofresh\.[a-z]+|allrecipes\.[a-z]+|bbcgoodfood\.com|ricardocuisine\.com|cuisineactuelle\.fr|journaldesfemmes\.fr|papillesetpupilles\.fr|cookomix\.com|cuisine-libre\.org|giallozafferano\.[a-z]+)$/i;
const isRecipeUrl = (t) => { const m = String(t || "").match(/https?:\/\/[^\s<>"]+/); if (!m) return false; try { const u = new URL(m[0]); return RECIPE_URL.test(u.hostname.replace(/^www\./, "")) || /\/(?:recettes?|recipes?|recette-|recipe-)|recette[s_-]|_recette/i.test(u.pathname); } catch (_) { return false; } };
// La notification d'un ajout reçu de Siri ou du menu Partager : une recette, une envie, un lien, ou une fiche à vérifier
function addMsg(t) {
  const first = (t.split("\n").map((l) => l.replace(/https?:\/\/\S+/g, "").trim()).find(Boolean) || "Lieu partagé").slice(0, 70);
  const recipe = isRecipeUrl(t) || (/^\s*(?:les\s+)?ingr[ée]dients?\b/im.test(t) && t.split("\n").length >= 3);
  const wish = /^\s*(?:(?:j['’]ai|on a|j['’]aurais|on aurait)\s+)?(?:bien\s+|trop\s+)?envie\s+d|\b(?:aux|à nos|dans nos|dans les)\s+envies\b|^\s*(?:une\s+)?id[ée]e\s+de\s+sortie/i.test(t);
  const bareLink = !recipe && /^\s*https?:\/\/\S+\s*$/.test(t) && !/maps\.apple|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(t);
  // une idée cadeau (liste secrète) : la notification ne part que sur le téléphone de la personne qui l'a dite
  const gift = /^\s*(?:une?\s+)?id[ée]e\s+(?:de\s+)?cadeaux?\b|^\s*cadeau\s+pour\s|^\s*(?:à|a)\s+offrir\s*[:,-]|^\s*lui\s+offrir\s|\b(?:à|a|dans)\s+(?:mes|ma\s+liste\s+d['’]\s*)?id[ée]es?\s+cadeaux?\s*[.!]?\s*$/i.test(t);
  if (gift) return { title: "Idée cadeau reçue", body: "Touche pour la ranger dans ta liste secrète." };
  if (recipe) return { title: "Recette reçue" + (first === "Lieu partagé" ? "" : " : " + first.slice(0, 50)), body: "Touche pour choisir les ingrédients à mettre sur la liste de courses." };
  if (wish) return { title: "Nouvelle envie : " + first.replace(/^\s*(?:(?:j['’]ai|on a|j['’]aurais|on aurait)\s+)?(?:bien\s+|trop\s+)?envie\s+(?:d['’]|de\s+)/i, "").replace(/^\s*(?:ajoute|rajoute|mets|note)\s+/i, "").replace(/\s+(?:aux|à nos|dans nos|dans les)\s+envies\s*$/i, "").slice(0, 60), body: "Touche pour l'ajouter à vos envies." };
  if (bareLink) return { title: "Lien reçu", body: "Touche pour en faire une envie de sortie ou un évènement." };
  // un lieu de Plans ou de Google Maps, sans rien d'autre
  if (/^\s*https?:\/\/\S+\s*$/.test(t) || /BEGIN:VCARD/i.test(t)) {
    let nm = ""; try { const u = new URL(t.trim()); nm = u.searchParams.get("name") || u.searchParams.get("q") || decodeURIComponent((u.pathname.match(/\/place\/([^/@]+)/) || [])[1] || "").replace(/\+/g, " "); } catch (_) { nm = (t.match(/^FN[^:]*:(.+)$/im) || [])[1] || ""; }
    return { title: "Lieu reçu" + (nm ? " : " + clean(nm.trim(), 50) : ""), body: "Touche pour en faire une envie de sortie ou un évènement." };
  }
  return { title: "À vérifier : " + first, body: "Touche pour voir la fiche et l'enregistrer." };
}
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", icirc: "î", iuml: "ï", ocirc: "ô", ucirc: "û", ugrave: "ù", euml: "ë", oelig: "œ", deg: "°", frac12: "½", frac14: "¼", frac34: "¾", hellip: "…" };
const unent = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => { if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; } const v = ENT[e.toLowerCase()]; return v === undefined ? m : v; });
// Une page web, lue comme un navigateur d'iPhone (2,5 Mo au plus, 7 s au plus)
async function fetchHtml(u) {
  try {
    const r = await fetch(u, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "fr-FR,fr;q=0.9" }, ...(AbortSignal.timeout ? { signal: AbortSignal.timeout(7000) } : {}) });
    if (!r.ok) return null;
    return (await r.text()).slice(0, 2500000);
  } catch (_) { return null; }
}
const tidy = (x, n) => clean(unent(String(x == null ? "" : x).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(), n || 160);
// Les blocs de données « JSON-LD » d'une page (schema.org), déjà lus
function ldBlocks(html) {
  const out = []; let i = 0, n = 0;
  while ((i = html.indexOf("application/ld+json", i)) >= 0 && n++ < 20) {
    const s0 = html.indexOf(">", i), e = s0 < 0 ? -1 : html.indexOf("</script>", s0); if (e < 0) break;
    const raw = html.slice(s0 + 1, e).trim().replace(/^<!--|-->$/g, "").replace(/^\/\*<!\[CDATA\[\*\/|\/\*\]\]>\*\/$/g, ""); i = e;
    try { out.push(JSON.parse(raw)); } catch (_) {}
  }
  return out;
}
function ldFind(o, test, d) {
  d = d || 0; if (!o || typeof o !== "object" || d > 6) return null;
  if (Array.isArray(o)) { for (const x of o) { const r = ldFind(x, test, d + 1); if (r) return r; } return null; }
  if (test(o)) return o;
  for (const k of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item", "about"]) if (o[k]) { const r = ldFind(o[k], test, d + 1); if (r) return r; }
  return null;
}
const ldType = (o, re) => o && typeof o === "object" && [].concat(o["@type"] || []).some((t) => re.test(String(t)));
async function fetchRecipe(u) {
  const html = await fetchHtml(u); if (html == null) return null;
  for (const j of ldBlocks(html)) {
    const rc = ldFind(j, (o) => ldType(o, /recipe/i)); if (!rc) continue;
    const ing = [].concat(rc.recipeIngredient || rc.ingredients || []).map((x) => tidy(x)).filter(Boolean).slice(0, 60);
    if (ing.length) return { name: tidy(rc.name).slice(0, 100), ing, y: tidy([].concat(rc.recipeYield || [])[0]).slice(0, 40) };
  }
  // microdonnées (pages plus anciennes) : itemprop="recipeIngredient"
  const md = [...html.matchAll(/itemprop=["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]{1,400}?)<\/(?:li|span|p|div)/gi)].map((m) => tidy(m[1])).filter(Boolean).slice(0, 60);
  return md.length ? { name: "", ing: md, y: "" } : null;
}
// Un lien partagé (resto, concert, lieu…) : son nom, son adresse, son prix et sa date, pour en faire une envie de sortie
const PLACE_RE = /restaurant|foodestablishment|localbusiness|touristattraction|museum|park|zoo|aquarium|theater|cinema|bowling|place|landmark|nightclub|bar|cafe|bakery|store|stadium|arena|lodging|hotel|campground|beach|sportsactivity|entertainment|event|festival|exhibition|concert/i;
function ldAddress(a) {
  if (!a) return "";
  if (typeof a === "string") return tidy(a, 200);
  if (Array.isArray(a)) return ldAddress(a[0]);
  if (typeof a === "object") {
    if (a.address) return ldAddress(a.address);
    return tidy([a.streetAddress, [a.postalCode, a.addressLocality].filter(Boolean).join(" ")].filter(Boolean).join(", "), 200);
  }
  return "";
}
async function fetchPage(u) {
  const html = await fetchHtml(u); if (html == null) return null;
  const meta = {};
  for (const m of html.slice(0, 400000).matchAll(/<meta\s[^>]*>/gi)) {
    const at = {}; for (const x of m[0].matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) at[x[1].toLowerCase()] = x[2] ?? x[3];
    const k = (at.property || at.name || "").toLowerCase(); if (k && at.content != null && !(k in meta)) meta[k] = tidy(at.content, 300);
  }
  const tt = (html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i) || [])[1];
  const out = { title: meta["og:title"] || meta["twitter:title"] || tidy(tt, 200), site: meta["og:site_name"] || "", desc: (meta["og:description"] || meta.description || "").slice(0, 200), place: "", price: null, priceTxt: "", date: "", time: "" };
  for (const j of ldBlocks(html)) {
    const o = ldFind(j, (x) => ldType(x, PLACE_RE) && (x.address || x.location || x.startDate)); if (!o) continue;
    const ev = !!o.startDate;
    if (o.name) out.name = tidy(o.name, 120);
    out.place = ldAddress(ev ? o.location : o.address) || ldAddress(o.location) || "";
    if (ev && o.location && o.location.name && out.place && !out.place.includes(String(o.location.name))) out.place = tidy(o.location.name, 80) + ", " + out.place;
    const off = [].concat(o.offers || [])[0];
    const pn = off && (off.price ?? off.lowPrice);
    if (pn != null && Number.isFinite(parseFloat(String(pn).replace(",", ".")))) out.price = Math.round(parseFloat(String(pn).replace(",", ".")) * 100) / 100;
    if (o.priceRange) { out.priceTxt = tidy(o.priceRange, 20); const pm = String(o.priceRange).match(/(\d+(?:[.,]\d+)?)/); if (out.price == null && pm) out.price = parseFloat(pm[1].replace(",", ".")); }
    const sd = String(o.startDate || ""); const dm = sd.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
    if (dm) { out.date = dm[1]; out.time = dm[2] || ""; }
    out.kind = ev ? "event" : "place";
    break;
  }
  return out.title || out.name ? out : null;
}
// Calendrier scolaire (data.education.gouv.fr) : [premier jour de vacances, jour de la rentrée), en dates de Paris
const PARIS_D = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
function parisDay(v) {
  const s = String(v || "").trim(); if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s); if (isNaN(d)) return "";
  const o = {}; for (const p of PARIS_D.formatToParts(d)) o[p.type] = p.value; return o.year + "-" + o.month + "-" + o.day;
}
async function fetchVacances(z) {
  const from = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
  const where = encodeURIComponent('zones="Zone ' + z + '" and end_date>=date\'' + from + '\'');
  const u = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?select=description,start_date,end_date,population,zones,annee_scolaire&where=" + where + "&order_by=start_date&limit=100";
  const r = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "Together (agenda a deux)" } });
  if (!r.ok) throw new Error("http " + r.status);
  const j = await r.json();
  const rows = Array.isArray(j.results) ? j.results : Array.isArray(j.records) ? j.records.map((x) => x.fields || x.record && x.record.fields || x) : [];
  const seen = new Map();
  for (const x of rows) {
    if (!x || /enseignant/i.test(String(x.population || ""))) continue;
    const a = parisDay(x.start_date), b = parisDay(x.end_date), n = tidy(x.description, 60);
    if (!a || !b || b <= a || !n) continue;
    const k = n + "|" + a; if (!seen.has(k)) seen.set(k, { n, a, b });
  }
  return [...seen.values()].sort((p, q) => p.a.localeCompare(q.a)).slice(0, 30);
}
// Ancien format (tout dans la fiche du couple) : on recopie chaque partie dans sa clé, une seule fois
async function migrate(env, id, c) {
  if (!c || !(c.subs || c.widgets || c.done || c.widget)) return c;
  if (c.subs && !(await env.KV.get("s:" + id))) await putSubs(env, id, c.subs);
  if (c.widgets && !(await env.KV.get("w:" + id))) await putWidgets(env, id, { at: c.wAt || 0, map: c.widgets });
  if (c.done && !(await env.KV.get("d:" + id))) await putDone(env, id, c.done);
  delete c.subs; delete c.widgets; delete c.done; delete c.wAt; delete c.widget;
  await putCouple(env, id, c);
  return c;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    const url = new URL(req.url), path = url.pathname;
    if (path === "/api/key") return json(req, { pub: (await vapidKeys(env)).pub });
    // Calendrier Together de chacun : /cal/<couple>/<clé de lecture>/<personne>.ics
    const cm = /^\/cal\/([A-Za-z0-9_-]{6,60})\/([0-9a-f]{32})\/([A-Za-z0-9_-]{1,80})\.ics$/.exec(path);
    if (cm && (req.method === "GET" || req.method === "HEAD")) {
      if (url.protocol === "http:") { url.protocol = "https:"; return Response.redirect(url.toString(), 301); }
      const [, id, key, uid] = cm;
      const c = await getCouple(env, id);
      if (!c || !c.token || key !== await calKey(c.token)) return new Response("Calendrier introuvable", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      const K = await getCals(env, id), body = K.map[uid];
      if (body && req.method === "GET") {
        // l'app peut confirmer que l'iPhone lit bien son calendrier (noté au plus toutes les 3 h)
        const seen = (await env.KV.get("ks:" + id, "json")) || {}, now = Date.now();
        if (!seen[uid] || now - seen[uid] > 3 * 3600000) {
          seen[uid] = now;
          const p = env.KV.put("ks:" + id, JSON.stringify(seen));
          if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
        }
      }
      return new Response(req.method === "HEAD" ? null : (body || CAL_EMPTY), { headers: {
        "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache, max-age=0",
        "Content-Disposition": 'inline; filename="together.ics"', "Access-Control-Allow-Origin": "*" } });
    }
    const ad = /^\/add\/([A-Za-z0-9_-]{6,60})\/([A-Za-z0-9_-]{1,80})\/([0-9a-f]{24})\/?$/.exec(path);
    if (ad) {
      const [, id, uid, key] = ad;
      const c = await getCouple(env, id);
      if (!c || !c.token || key !== await addKey(c.token, uid)) return txt("Lien d'ajout inconnu. Copie à nouveau ton lien dans Together : Réglages communs, Siri et voiture.", 404);
      if (goneOf(c).includes(uid)) return txt("Ce téléphone n'a plus accès à Together.", 403);
      try { await noteUse(env, ctx, id, uid, "a"); } catch (_) {}
      let t = url.searchParams.get("t") || url.searchParams.get("text") || "";
      if (req.method === "POST") {
        const ct = (req.headers.get("Content-Type") || "").toLowerCase();
        try {
          if (ct.includes("application/json")) { const j = await req.json(); const v = j && (j.t ?? j.text ?? j.texte); if (v != null) t = typeof v === "string" ? v : JSON.stringify(v); }
          else if (ct.includes("form")) { const f = await req.formData(); const v = f.get("t") || f.get("text") || f.get("texte"); if (v) t = typeof v === "string" ? v : await v.text(); }
          else { const v = await req.text(); if (v) t = v; }
        } catch (_) {}
      } else if (req.method !== "GET") return txt("Méthode refusée.", 405);
      t = String(t || "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, 1500);
      if (!t) return txt("Rien à ajouter : dis ou partage ce que vous avez prévu.", 400);
      const list = await getAdds(env, id);
      if (list.filter((x) => x.u === uid).length >= 10) return txt("Trop d'ajouts en attente : ouvre Together pour les vérifier.", 429);
      t = await expandLinks(t);
      const r8 = new Uint8Array(8); crypto.getRandomValues(r8);
      const aid = b64u(r8).replace(/[^A-Za-z0-9]/g, "x").slice(0, 10);
      list.push({ id: aid, u: uid, t, at: Date.now() });
      await putAdds(env, id, list);
      const subs = await getSubs(env, id, c);
      const r = await sendTo(env, subs, [uid], { ...addMsg(t), tag: "add-" + aid, url: "./?add=" + aid });
      if (r.changed) await putSubs(env, id, subs);
      try { await logSends(env, id, "a", r.codes.map((x) => ({ ...x, tag: "add" }))); } catch (_) {}
      return txt(r.sent ? "C'est noté. Touche la notification de Together pour vérifier la fiche." : "C'est noté. Ouvre Together pour vérifier la fiche.");
    }
    // Siri en voiture : /car/<couple>/<personne>/<clé> (même clé personnelle que l'ajout)
    //   (rien) ou ?a=go : l'adresse du prochain départ, en texte, pour l'action « Afficher l'itinéraire » du raccourci ;
    //                     si l'on passe récupérer l'autre en chemin, son adresse d'abord, et l'autre reçoit « en route »
    //   ?a=bas : prévient l'autre que l'on est en bas ;  ?a=next : le prochain départ, à lire par Siri
    //   ?a=auto : en montant dans la voiture (automatisation CarPlay), la phrase du départ dans l'heure, sinon « Rien »
    //   ?a=day : la journée (et demain), à lire par Siri ;  ?a=retard&m=10 : prévient l'autre d'un retard
    const cr = /^\/car\/([A-Za-z0-9_-]{6,60})\/([A-Za-z0-9_-]{1,80})\/([0-9a-f]{24})\/?$/.exec(path);
    if (cr) {
      // lisible aussi par l'app (bouton « Essayer » des réglages)
      const txt = (t, st) => { const r = new Response(t, { status: st || 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...cors(req) } }); return r; };
      const [, id, uid, key] = cr;
      const c = await getCouple(env, id);
      if (!c || !c.token || key !== await addKey(c.token, uid)) return txt("Lien voiture inconnu. Copie à nouveau ton lien dans Together : Réglages communs, Siri et voiture.", 404);
      if (goneOf(c).includes(uid)) return txt("Ce téléphone n'a plus accès à Together.", 403);
      // (« Essayer » dans l'app passe aussi par ici : seule l'utilisation depuis l'iPhone compte)
      if (!ORIGIN_OK(req.headers.get("Origin")) || !req.headers.get("Origin")) { try { await noteUse(env, ctx, id, uid, "c"); } catch (_) {} }
      const act = String(url.searchParams.get("a") || "go").toLowerCase(), now = Date.now();
      const W = await getWidgets(env, id, c), D = (W.map && W.map[uid]) || {};
      let fmt; try { fmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: D.tz || "Europe/Paris" }); } catch (_) { fmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }); }
      const hm = (ms) => fmt.format(new Date(ms)).replace(/\s/g, "");
      const me = clean(D.me, 30) || "Together";
      // nos moments à deux et les miens (pas ceux de l'autre seul), sauf avec une ancienne version de l'app
      const mine = (x) => !x.wu || x.wu === uid;
      const all = (await tfShift(env, id, Array.isArray(D.items) ? D.items : [])).filter((x) => x && +x.s > 0).sort((p, q) => p.s - q.s);
      const items = all.filter((x) => !x.a && mine(x));
      const ids = Array.isArray(D.ids) ? D.ids.map((x) => clean(x, 80)) : [], names = Array.isArray(D.names) ? D.names.map((x) => clean(x, 30)) : [];
      const nameOf = (u) => (ids.indexOf(u) >= 0 && names[ids.indexOf(u)]) || "";
      const hs = (ms) => { const [h, m] = hm(ms).split(":"); return +h + " h" + (m && m !== "00" ? " " + m : ""); };
      const ref = (x) => +x.d || +x.s;
      const nx = items.find((x) => ref(x) > now - 45 * 60000 && x.s > now - 10 * 60000 && ref(x) < now + 4 * 3600000);
      const tell = async (to, msg, kind) => {
        const subs = await getSubs(env, id, c), r = await sendTo(env, subs, [to], msg);
        if (r.changed) await putSubs(env, id, subs);
        try { await logSends(env, id, kind, r.codes.map((x) => ({ ...x, tag: msg.tag }))); } catch (_) {}
        return r.sent;
      };
      if (act === "next" || act === "info") {
        if (!nx) return txt("Rien de prévu dans les 4 prochaines heures.");
        return txt((nx.d ? "Départ à " + hm(nx.d) : "Rendez-vous à " + hm(nx.s)) + " pour « " + clean(nx.t, 60) + " »" + (nx.pk ? ", en passant récupérer " + clean(nx.pw, 20) : "") + ".");
      }
      if (act === "auto" || act === "carplay") {
        const ax = items.find((x) => { const r0 = ref(x); return r0 > now - 20 * 60000 && r0 < now + 60 * 60000 && x.s > now - 5 * 60000; });
        if (!ax) return txt("Rien");
        const dep = +ax.d || 0, mins = Math.round(((dep || ax.s) - now) / 60000);
        let say = dep ? (mins < -4 ? "Le départ était prévu à " + hs(dep) + " : tu as environ " + (-mins) + " minutes de retard" : mins <= 1 ? "C'est l'heure de partir" : "Départ dans " + mins + " minutes")
          : (mins <= 1 ? "C'est maintenant" : "Dans " + mins + " minutes");
        say += " pour « " + clean(ax.t, 60) + " », à " + hs(ax.s) + ".";
        if (ax.pk) say += " On passe d'abord récupérer " + clean(ax.pw, 20) + ".";
        if (+ax.tf > 0) say += " Trafic chargé : " + ax.tf + " minutes de plus que prévu.";
        if (dep && mins < -4) say += " Dis « je suis en retard » pour prévenir " + (clean(ax.pw, 20) || nameOf(ids.find((u) => u !== uid)) || "l'autre") + ".";
        return txt(say);
      }
      if (act === "day" || act === "jour" || act === "journee") {
        const tz = D.tz || "Europe/Paris";
        let dkf; try { dkf = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }); } catch (_) { dkf = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }); }
        const dk = (ms) => { const o = {}; for (const p of dkf.formatToParts(new Date(ms))) o[p.type] = p.value; return o.year + "-" + o.month + "-" + o.day; };
        const d0 = dk(now), d1 = dk(now + 86400000);
        const say1 = (x) => (x.a ? "toute la journée" : hs(x.s)) + ", " + clean(x.t, 60) + (x.wu && x.wu !== uid ? " pour " + (nameOf(x.wu) || "l'autre") : x.wu === uid ? " pour toi" : "")
          + (!x.a && mine(x) && x.pk ? ", en passant récupérer " + clean(x.pw, 20) : "") + (!x.a && mine(x) && +x.d > now ? ", départ à " + hs(+x.d) : "");
        const today = all.filter((x) => dk(x.s) === d0 && (x.a || x.s > now - 30 * 60000)).slice(0, 6), tom = all.filter((x) => dk(x.s) === d1).slice(0, 4);
        if (!today.length && !tom.length) return txt("Rien de prévu aujourd'hui ni demain. Profitez-en !");
        return txt((today.length ? "Aujourd'hui : " + today.map(say1).join(" ; ") + "." : "Plus rien aujourd'hui.") + (tom.length ? " Demain : " + tom.map(say1).join(" ; ") + "." : " Rien de prévu demain."));
      }
      if (act === "retard" || act === "late") {
        const mm = /(\d{1,3})/.exec(String(url.searchParams.get("m") || url.searchParams.get("min") || ""));
        const m = Math.max(1, Math.min(180, mm ? +mm[1] : 10));
        // d'abord un moment à deux dans les 3 heures, sinon un des miens ; sans rien de prévu, un simple message
        const win = (x) => x.s > now - 30 * 60000 && x.s < now + 3 * 3600000;
        const lx = items.find((x) => !x.wu && win(x)) || items.find(win) || null;
        const subs0 = await getSubs(env, id, c), to = lx && lx.pk && lx.pu ? lx.pu : (ids.find((u) => u !== uid) || Object.keys(subs0).find((u) => u !== uid) || "");
        if (!to) return txt("Personne à prévenir pour l'instant.", 404);
        // au plus 6 messages de retard par heure
        const rk = "lr:" + id + ":" + uid, rn = +(await env.KV.get(rk)) || 0;
        if (rn >= 6) return txt("Déjà prévenu plusieurs fois. Ouvre Together pour écrire un message.", 429);
        await env.KV.put(rk, String(rn + 1), { expirationTtl: 3600 });
        const who = nameOf(to) || (lx && clean(lx.pw, 20)) || "l'autre";
        if (!lx) {
          await tell(to, { title: me + " aura environ " + m + " min de retard", body: "Message envoyé depuis la voiture.", tag: "late-x", url: "./" }, "c");
          return txt("C'est envoyé à " + who + " : environ " + m + " minutes de retard.");
        }
        const body = lx.pk && +lx.d ? "Passage pour te récupérer vers " + hm(+lx.d + (+lx.pm || 0) * 60000 + m * 60000) + " au lieu de " + hm(+lx.d + (+lx.pm || 0) * 60000) + " (« " + clean(lx.t, 60) + " »)."
          : "Pour « " + clean(lx.t, 60) + " » à " + hm(lx.s) + " : arrivée vers " + hm(lx.s + m * 60000) + ".";
        await tell(to, { title: me + " aura environ " + m + " min de retard", body, tag: "late-" + clean(lx.id || "x", 30), url: lx.id ? "./?ev=" + clean(lx.id, 40) : "./" }, "c");
        // l'app l'affiche ensuite sur l'évènement, chez vous deux
        const LT = ((await env.KV.get("lt:" + id, "json")) || []).filter((x) => now - x.at < 12 * 3600000 && !(x.u === uid && x.e === clean(lx.id, 40)));
        LT.push({ e: clean(lx.id, 40), u: uid, m, at: now, s: lx.s, t: clean(lx.t, 60) });
        await env.KV.put("lt:" + id, JSON.stringify(LT.slice(-10)));
        return txt("C'est envoyé à " + who + " : environ " + m + " minutes de retard pour « " + clean(lx.t, 60) + " ».");
      }
      if (act === "bas" || act === "here") {
        const p = items.find((x) => x.pk && x.pu && ref(x) > now - 90 * 60000 && x.s > now - 30 * 60000 && ref(x) < now + 2 * 3600000);
        if (!p) return txt("Pas de récupération prévue maintenant.", 404);
        await tell(p.pu, { title: me + " est en bas", body: me + " t'attend en bas pour « " + clean(p.t, 60) + " ».", tag: "car-bas", url: "./" }, "c");
        return txt("C'est envoyé à " + clean(p.pw, 20) + ".");
      }
      if (!nx) { const h = clean(D.home, 160); return h ? txt(h) : txt("Rien de prévu dans les 4 prochaines heures.", 404); }
      if (nx.pk && nx.pu) {
        // une seule notification « en route » par départ, même si Siri relance le raccourci
        const gk = "cg:" + id + ":" + uid + ":" + nx.s;
        if (!(await env.KV.get(gk))) {
          await env.KV.put(gk, "1", { expirationTtl: 3600 });
          await tell(nx.pu, { title: me + " est en route", body: "Arrivée prévue vers " + hm(now + (+nx.pm || 0) * 60000) + " pour « " + clean(nx.t, 60) + " ».", tag: "car-go", url: "./" }, "c");
        }
        return txt(clean(nx.pk, 160));
      }
      const dest = clean(nx.to || nx.l, 160);
      return dest ? txt(dest) : txt("« " + clean(nx.t, 60) + " » n'a pas d'adresse.", 404);
    }
    if (path === "/api/vacances" && req.method === "GET") {
      const z = String(url.searchParams.get("z") || "").toUpperCase();
      if (!/^[ABC]$/.test(z)) return json(req, { ok: false, error: "zone" }, 400);
      const ck = "vac:" + z, cached = await env.KV.get(ck, "json");
      if (cached && Date.now() - cached.at < 7 * 86400000 && !url.searchParams.has("fresh")) return json(req, { ok: true, zone: z, list: cached.list, at: cached.at });
      let list = null; try { list = await fetchVacances(z); } catch (_) {}
      if (list && list.length) { const at = Date.now(); await env.KV.put(ck, JSON.stringify({ at, list })); return json(req, { ok: true, zone: z, list, at }); }
      if (cached) return json(req, { ok: true, zone: z, list: cached.list, at: cached.at, stale: true });
      return json(req, { ok: false, error: "source" }, 502);
    }
    if (path === "/api/w" && req.method === "GET") {
      const id = clean(url.searchParams.get("c"), 60), t = clean(url.searchParams.get("t"), 80);
      const c = id && await getCouple(env, id);
      if (!c || !t || c.token !== t) return json(req, { error: "unknown" }, 404);
      const u = clean(url.searchParams.get("u"), 80), W = await getWidgets(env, id, c);
      // un ancien téléphone retiré : son widget le dit, sans plus rien montrer
      if (u && goneOf(c).includes(u)) return json(req, { gone: 1, data: null });
      // (le diagnostic passe aussi par ici : il ne compte pas comme une utilisation du widget)
      if (!url.searchParams.has("diag")) { try { await noteUse(env, ctx, id, u, "w", clean(url.searchParams.get("wv"), 8)); } catch (_) {} }
      let data = (W.map[u] || Object.values(W.map)[0]) || null;
      if (data && Array.isArray(data.items)) { const it2 = await tfShift(env, id, data.items); if (it2 !== data.items) data = { ...data, items: it2 }; }
      // « Dis Siri, je suis en retard » : le retard annoncé par l'autre (depuis moins de 3 h) arrive tout de suite dans le widget
      if (data) {
        const now = Date.now(), ids = Array.isArray(data.ids) ? data.ids : [], names = Array.isArray(data.names) ? data.names : [];
        const lt = ((await env.KV.get("lt:" + id, "json")) || []).filter((x) => x && x.u !== u && now - (+x.at || 0) < 3 * 3600000)
          .map((x) => ({ e: clean(x.e, 40), u: clean(x.u, 80), n: clean(names[ids.indexOf(x.u)], 30), m: +x.m || 0, at: +x.at || 0, s: +x.s || 0, t: clean(x.t, 60) }));
        if (lt.length) return json(req, { at: W.at || 0, data: { ...data, late: lt.slice(-3) } });
      }
      return json(req, { at: W.at || 0, data });
    }
    // la photo du widget « Souvenir » (envoyée par l'app quand elle change)
    if (path === "/api/wimg" && req.method === "GET") {
      const id = clean(url.searchParams.get("c"), 60), t = clean(url.searchParams.get("t"), 80), k = clean(url.searchParams.get("k"), 40);
      const c = id && await getCouple(env, id);
      if (!c || !t || c.token !== t || !/^[a-z0-9]{4,40}$/.test(k)) return json(req, { error: "unknown" }, 404);
      const d = await env.KV.get("wi:" + id + ":" + k);
      const m = d && /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(d);
      if (!m) return json(req, { error: "image" }, 404);
      const bin = atob(m[1]), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Response(u8, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", ...cors(req) } });
    }
    if (req.method !== "POST") return json(req, { ok: true, service: "Together" });
    if (!ORIGIN_OK(req.headers.get("Origin"))) return json(req, { error: "origin" }, 403);
    let b; try { b = await req.json(); } catch (_) { return json(req, { error: "json" }, 400); }
    const id = clean(b.couple, 60), token = clean(b.token, 80);
    if (!/^[A-Za-z0-9_-]{6,60}$/.test(id) || token.length < 24) return json(req, { error: "auth" }, 401);
    let c = await getCouple(env, id);
    if (!c) { c = { token, sched: [] }; await putCouple(env, id, c); await addIndex(env, id); }
    else if (c.token !== token) return json(req, { error: "auth" }, 401);
    else c = await migrate(env, id, c);
    if (path === "/api/sub") {
      const uid = clean(b.uid, 80), s = b.sub;
      if (!uid || !s || !/^https:\/\//.test(s.endpoint || "") || !s.keys || !s.keys.p256dh || !s.keys.auth) return json(req, { error: "sub" }, 400);
      if (goneOf(c).includes(uid)) return json(req, { error: "gone" }, 403);
      const subs = await getSubs(env, id, c);
      const list = (subs[uid] || []).filter((x) => x.endpoint !== s.endpoint);
      list.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, at: Date.now(), ...(b.dev ? { dev: clean(b.dev, 40) } : {}) });
      subs[uid] = list.slice(-3); await putSubs(env, id, subs);
      if (b.hello) { const r = await sendTo(env, subs, [uid], { title: "Notifications activées", body: "Together te préviendra ici, même quand l'app est fermée.", tag: "hello" }); if (r.changed) await putSubs(env, id, subs); }
      return json(req, { ok: true });
    }
    if (path === "/api/unsub") { const uid = clean(b.uid, 80), subs = await getSubs(env, id, c); if (subs[uid]) { subs[uid] = subs[uid].filter((x) => x.endpoint !== b.endpoint); await putSubs(env, id, subs); } return json(req, { ok: true }); }
    if (path === "/api/notify") {
      const to = (Array.isArray(b.to) ? b.to : [b.to]).map((x) => clean(x, 80)).filter(Boolean).slice(0, 2);
      if (b.hold) {
        const m = b.meta && typeof b.meta === "object" ? { k: clean(b.meta.k, 8), who: clean(b.meta.who, 30), t: clean(b.meta.t, b.meta.k === "shop" ? 120 : 60), when: clean(b.meta.when, 40) } : null;
        const H = (await env.KV.get("h:" + id, "json")) || [], now = Date.now();
        for (const u of to) H.push({ u, title: clean(b.title, 120), body: clean(b.body, 300), tag: clean(b.tag, 60), url: clean(b.url, 200), ...(m ? { meta: m } : {}), at: now });
        await env.KV.put("h:" + id, JSON.stringify(H.slice(-60)));
        return json(req, { ok: true, sent: 0, held: to.length, codes: [] });
      }
      const subs = await getSubs(env, id, c);
      const r = await sendTo(env, subs, to, { title: clean(b.title, 120), body: clean(b.body, 300), tag: clean(b.tag, 60), url: clean(b.url, 200) });
      if (r.changed) await putSubs(env, id, subs);
      try { await logSends(env, id, "n", r.codes.map((c) => ({ ...c, tag: b.tag }))); } catch (_) {}
      return json(req, { ok: true, sent: r.sent, codes: r.codes.map((c) => c.st) });
    }
    if (path === "/api/schedule") {
      const now = Date.now(), done = new Set(await getDone(env, id, c));
      c.sched = (Array.isArray(b.items) ? b.items : []).slice(0, 200).map((x) => ({ id: clean(x.id, 120), to: (Array.isArray(x.to) ? x.to : [x.to]).map((u) => clean(u, 80)).slice(0, 2), at: +x.at || 0, title: clean(x.title, 120), body: clean(x.body, 300), tag: clean(x.tag, 60), ...(x.lv ? { lv: 1 } : {}) }))
        .filter((x) => x.id && x.at > now - 60000 && x.at < now + 40 * 86400000 && !done.has(x.id));
      // dernière synchronisation de chaque téléphone, avec la version de l'app (aide au diagnostic)
      const who = clean(b.uid, 80);
      // un ancien téléphone retiré ne touche plus à rien (pas même aux rappels de l'autre)
      if (who && goneOf(c).includes(who)) return json(req, { ok: false, gone: true }, 403);
      // retiré par erreur ? Il revient dès que l'autre téléphone le compte encore parmi vous deux
      if (Array.isArray(b.members) && goneOf(c).length) { const mem = b.members.slice(0, 4).map((x) => clean(x, 80)); const back = c.gone.filter((u) => mem.includes(u) && u !== who); if (back.length) c.gone = c.gone.filter((u) => !back.includes(u)); }
      if (who) { c.seen = c.seen && typeof c.seen === "object" ? c.seen : {}; c.seen[who] = { v: clean(b.v, 12) || "<51", at: now, ...(b.dev ? { dev: clean(b.dev, 40) } : {}) }; }
      // les trajets en voiture à vérifier (trafic en direct) ; une ancienne version de l'app n'en envoie pas : on garde les précédents
      if (Array.isArray(b.watch)) c.watch = b.watch.slice(0, 20).map((x) => cleanWatch(x, now)).filter(Boolean);
      // rappels privés (idées cadeaux) : envoyés par ce téléphone seulement, pour lui seul ; l'autre téléphone ne les remplace pas
      if (who && Array.isArray(b.own)) {
        c.own = c.own && typeof c.own === "object" ? c.own : {};
        c.own[who] = b.own.slice(0, 20).map((x) => ({ id: clean(x.id, 120), to: [who], at: +x.at || 0, title: clean(x.title, 120), body: clean(x.body, 300), tag: clean(x.tag, 60) }))
          .filter((x) => x.id && x.at > now - 60000 && x.at < now + 40 * 86400000 && !done.has(x.id));
      }
      // ne pas déranger la nuit (choix de chacun) : le serveur en a besoin pour garder les nouveautés jusqu'à 7 h
      if (b.prefs && typeof b.prefs === "object") { const P = {};
        for (const [k, v] of Object.entries(b.prefs).slice(0, 4)) if (UID_RE.test(k)) P[k] = { quiet: !!(v && v.quiet), tz: clean(v && v.tz, 40) || "Europe/Paris" };
        c.prefs = P; }
      await putCouple(env, id, c);
      // widgets : celui de ce téléphone, et celui de l'autre (sans toucher à ses couleurs)
      const W = await getWidgets(env, id, c), me = clean(b.uid, 80);
      let wChanged = false;
      if (b.widget && typeof b.widget === "object" && me) { W.map[me] = b.widget; wChanged = true; }
      if (b.widgets && typeof b.widgets === "object") {
        for (const [k, w] of Object.entries(b.widgets).slice(0, 2)) {
          const uid = clean(k, 80); if (!uid || !w || typeof w !== "object" || uid === me) continue;
          const old = W.map[uid] || {};
          W.map[uid] = { ...w, th: old.th || w.th }; wChanged = true;
        }
      }
      if (wChanged) { W.at = now; await putWidgets(env, id, W); }
      // la photo du widget « Souvenir » : seulement quand elle change, gardée 9 jours
      if (b.wimg && typeof b.wimg === "object") {
        const k = clean(b.wimg.k, 40), d = typeof b.wimg.d === "string" ? b.wimg.d : "";
        if (/^[a-z0-9]{4,40}$/.test(k) && d.length < 600000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d))
          await env.KV.put("wi:" + id + ":" + k, d, { expirationTtl: 9 * 86400 });
      }
      // calendriers .ics de chacun (envoyés seulement quand ils changent)
      if (b.cals && typeof b.cals === "object") {
        const K = await getCals(env, id); let kChanged = false;
        for (const [k, t] of Object.entries(b.cals).slice(0, 2)) {
          if (!UID_RE.test(k) || typeof t !== "string" || !t.startsWith("BEGIN:VCALENDAR") || t.length > 700000) continue;
          if (K.map[k] !== t) { K.map[k] = t; kChanged = true; }
        }
        if (kChanged) {
          // au plus 4 personnes : on retire d'abord celles que ce téléphone n'a pas envoyées (ancien téléphone…)
          const sent = new Set(Object.keys(b.cals)), old = Object.keys(K.map).filter((k) => !sent.has(k));
          while (Object.keys(K.map).length > 4 && old.length) delete K.map[old.shift()];
          K.at = now; await env.KV.put("k:" + id, JSON.stringify(K));
        }
      }
      return json(req, { ok: true, count: c.sched.length });
    }
    if (path === "/api/addget") {
      const uid = clean(b.uid, 80), list = await getAdds(env, id);
      const lt = ((await env.KV.get("lt:" + id, "json")) || []).filter((x) => Date.now() - x.at < 12 * 3600000);
      return json(req, { ok: true, items: list.filter((x) => x.u === uid).map((x) => ({ id: x.id, t: x.t, at: x.at })), late: lt });
    }
    if (path === "/api/adddone") {
      const uid = clean(b.uid, 80), ids = new Set((Array.isArray(b.ids) ? b.ids : [b.id]).map((x) => clean(x, 20)).filter(Boolean));
      const list = await getAdds(env, id), keep = list.filter((x) => !(x.u === uid && ids.has(x.id)));
      if (keep.length !== list.length) await putAdds(env, id, keep);
      return json(req, { ok: true, left: keep.filter((x) => x.u === uid).length });
    }
    if (path === "/api/recipe") {
      let u = null; try { u = new URL(clean(b.url, 800)); } catch (_) {}
      // une vraie page web seulement (pas d'adresse interne)
      if (!u || !/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || /^(?:localhost|[\d.]+|\[.*\])$/i.test(u.hostname) || /\.(?:local|internal|lan)$/i.test(u.hostname)) return json(req, { ok: false, error: "url" }, 400);
      const r = await fetchRecipe(u.toString());
      return json(req, r ? { ok: true, ...r } : { ok: false });
    }
    if (path === "/api/page") {
      let u = null; try { u = new URL(clean(b.url, 800)); } catch (_) {}
      if (!u || !/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || /^(?:localhost|[\d.]+|\[.*\])$/i.test(u.hostname) || /\.(?:local|internal|lan)$/i.test(u.hostname)) return json(req, { ok: false, error: "url" }, 400);
      const r = await fetchPage(u.toString());
      return json(req, r ? { ok: true, ...r } : { ok: false });
    }
    // L'itinéraire avec le trafic, pour la carte (gardé 5 min ; au plus 60 calculs par jour et par couple)
    if (path === "/api/route") {
      const K = await env.KV.get("tk:" + id, "json");
      if (!K || !K.k) return json(req, { ok: false, error: "nokey" });
      const pts = (Array.isArray(b.pts) ? b.pts : []).map(ptOf).filter(Boolean).slice(0, 3);
      if (pts.length < 2) return json(req, { ok: false, error: "pts" }, 400);
      const now = Date.now(), sig = pts.map((p) => p.lat.toFixed(4) + "," + p.lon.toFixed(4)).join(";"), C = (await env.KV.get("rt:" + id, "json")) || {};
      const hit = C.r && C.r[sig];
      if (hit && now - hit.at < 5 * 60000) return json(req, { ok: true, cached: 1, ...hit });
      const day = new Date(now).toISOString().slice(0, 10), n = C.d === day ? +C.n || 0 : 0;
      if (n >= 60) return json(req, { ok: false, error: "quota" });
      const r = await ttRoute(K.k, pts, now);
      if (!r.ok) return json(req, { ok: false, error: "tomtom", st: r.st });
      const out = { at: now, pts: r.pts, sec: r.sec, min: r.min, free: r.free, km: r.km };
      const keep = Object.entries(C.r || {}).filter(([k, v]) => k !== sig && v && now - v.at < 3 * 3600000).sort((x, y) => y[1].at - x[1].at).slice(0, 4);
      await env.KV.put("rt:" + id, JSON.stringify({ d: day, n: n + 1, r: { ...Object.fromEntries(keep), [sig]: out } }));
      return json(req, { ok: true, ...out });
    }
    if (path === "/api/traffic") {
      const now = Date.now();
      if (b.del) { await env.KV.delete("tk:" + id); return json(req, { ok: true, has: false }); }
      if (typeof b.key === "string" && b.key.trim()) {
        const k = b.key.trim();
        if (!/^[A-Za-z0-9_-]{16,80}$/.test(k)) return json(req, { ok: false, error: "format" });
        const r = await ttDrive(k, TT_TEST, 0, now);
        if (!r.ok) return json(req, { ok: false, error: r.st === 401 || r.st === 403 ? "refusée" : "injoignable", st: r.st });
        await env.KV.put("tk:" + id, JSON.stringify({ k, at: now, by: clean(b.uid, 80) }));
        return json(req, { ok: true, has: true, last4: k.slice(-4), at: now, test: Math.round(r.min * 10) / 10 });
      }
      const K = await env.KV.get("tk:" + id, "json"), TF = (await env.KV.get("tf:" + id, "json")) || {};
      if (b.id && K && K.k) {
        const x = cleanWatch(b.w, now);
        if (!x || x.id !== clean(b.id, 60)) return json(req, { ok: false, error: "watch" }, 400);
        const prev = TF[x.id] && TF[x.id].dep === x.dep ? TF[x.id] : null;
        // au plus une vérification toutes les 2 minutes par trajet
        if (prev && now - (+prev.at || 0) < 120000 && !prev.err) return json(req, { ok: true, has: true, tf: TF });
        const r = await ttCheck(K.k, x, now);
        if (!r.ok) return json(req, { ok: false, has: true, error: "tomtom", st: r.st, tf: TF });
        TF[x.id] = { dep: x.dep, s: x.s, d: r.d, m: Math.round(r.drive), k: prev ? +prev.k || 0 : 0, at: now, sent: prev ? +prev.sent || 0 : 0, al: r.d >= ttThr(x) ? 1 : 0 };
        await env.KV.put("tf:" + id, JSON.stringify(TF));
        return json(req, { ok: true, has: true, tf: TF });
      }
      return json(req, { ok: true, has: !!(K && K.k), last4: K && K.k ? K.k.slice(-4) : "", at: K ? +K.at || 0 : 0, tf: TF });
    }
    // « Tout marche ? » : ce que le serveur sait de chaque téléphone (version, notifications, widget, calendrier, Siri)
    if (path === "/api/health") {
      const now = Date.now(), gone = goneOf(c);
      const subs = await getSubs(env, id, c), W = await getWidgets(env, id, c), K = await getCals(env, id);
      const ks = (await env.KV.get("ks:" + id, "json")) || {}, us = (await env.KV.get("us:" + id, "json")) || {}, L = (await env.KV.get("l:" + id, "json")) || [];
      const all = new Set([...Object.keys(c.seen || {}), ...Object.keys(subs), ...Object.keys(W.map || {}), ...Object.keys(K.map || {}), ...Object.keys(ks), ...Object.keys(us)]);
      const out = {};
      for (const u of [...all].filter((x) => UID_RE.test(x) && !gone.includes(x)).slice(0, 12)) {
        // le journal garde 8 caractères de l'identifiant (4 dans les anciennes lignes)
        const s = (c.seen || {})[u] || {}, lg = L.filter((x) => x && (x.to === u.slice(0, 8) || (String(x.to).length === 4 && x.to === u.slice(0, 4))));
        const okAt = lg.filter((x) => x.st >= 200 && x.st < 300).reduce((m, x) => Math.max(m, +x.at || 0), 0);
        const bad = lg.filter((x) => !(x.st >= 200 && x.st < 300)).sort((p, q) => (+p.at || 0) - (+q.at || 0)).pop();
        const U = us[u] || {}, w = U.w && typeof U.w === "object" ? U.w : U.w ? { at: +U.w } : null;
        out[u] = { v: clean(s.v, 12), at: +s.at || 0, dev: clean(s.dev, 40), name: clean((W.map[u] || {}).me, 30),
          subs: await Promise.all((subs[u] || []).map(async (x) => ({ h: await epHash(x.endpoint), at: +x.at || 0, dev: clean(x.dev, 40), apple: /push\.apple\.com/.test(x.endpoint) ? 1 : 0 }))),
          w: w ? { at: +w.at || 0, v: clean(w.v, 8) } : null, cal: +ks[u] || 0, calOn: K.map && K.map[u] ? 1 : 0, add: +U.a || 0, car: +U.c || 0,
          ok: okAt, bad: bad && (+bad.at || 0) > okAt ? { st: bad.st, at: +bad.at || 0, rs: clean(bad.rs, 40) } : null };
      }
      return json(req, { ok: true, now, u: out, gone: gone.length });
    }
    // Retirer un ancien téléphone : plus de notifications, de widget, de calendrier ni de liens Siri pour lui
    if (path === "/api/forget") {
      const u = clean(b.uid, 80), me = clean(b.me, 80);
      if (!UID_RE.test(u) || u === me) return json(req, { error: "uid" }, 400);
      const subs = await getSubs(env, id, c); if (subs[u]) { delete subs[u]; await putSubs(env, id, subs); }
      const W = await getWidgets(env, id, c); if (W.map && W.map[u]) { delete W.map[u]; await putWidgets(env, id, W); }
      const K = await getCals(env, id); if (K.map && K.map[u]) { delete K.map[u]; await env.KV.put("k:" + id, JSON.stringify(K)); }
      for (const k of ["ks:", "us:"]) { const o = (await env.KV.get(k + id, "json")) || {}; if (o[u] != null) { delete o[u]; await env.KV.put(k + id, JSON.stringify(o)); } }
      if (c.seen) delete c.seen[u];
      if (c.prefs) delete c.prefs[u];
      if (c.own) delete c.own[u];
      c.gone = [...goneOf(c).filter((x) => x !== u), u].slice(-20);
      c.sched = (Array.isArray(c.sched) ? c.sched : []).map((x) => ({ ...x, to: (x.to || []).filter((t) => t !== u) })).filter((x) => x.to.length);
      await putCouple(env, id, c);
      return json(req, { ok: true });
    }
    // Nettoyer ses propres abonnements : ceux d'avant (même personne, ancienne inscription), désignés par leur empreinte
    if (path === "/api/unsubh") {
      const u = clean(b.uid, 80), hs = new Set((Array.isArray(b.h) ? b.h : []).slice(0, 6).map((x) => clean(x, 16)));
      const subs = await getSubs(env, id, c), list = subs[u] || [], keep = [];
      for (const x of list) if (!hs.has(await epHash(x.endpoint))) keep.push(x);
      if (keep.length !== list.length) { subs[u] = keep; await putSubs(env, id, subs); }
      return json(req, { ok: true, left: keep.length });
    }
    if (path === "/api/calstat") {
      const seen = (await env.KV.get("ks:" + id, "json")) || {}, K = await getCals(env, id);
      return json(req, { ok: true, seen, at: K.at || 0, members: Object.keys(K.map) });
    }
    return json(req, { error: "path" }, 404);
  },
  // Chaque minute : envoie les rappels arrivés à l'heure
  async scheduled(ev, env) {
    const idx = (await env.KV.get("index", "json")) || [], now = Date.now();
    for (const id of idx) {
      const c0 = await getCouple(env, id);
      if (c0) { try { await flushHeld(env, id, c0, now); } catch (_) {} }
      const c = c0; if (!c) continue;
      try { await trafficTick(env, id, c, now); } catch (_) {}
      const list = [...(Array.isArray(c.sched) ? c.sched : []), ...Object.values(c.own && typeof c.own === "object" ? c.own : {}).flat()];
      if (!list.length) continue;
      // l'alerte « C'est l'heure de partir » avance quand le trafic allonge le trajet (vérifié moins de 3 h avant)
      let TF = null;
      if (list.some((x) => x.lv) && Array.isArray(c.watch) && c.watch.some((w) => w.dep > now - 3600000 && w.dep < now + 4 * 3600000)) TF = (await env.KV.get("tf:" + id, "json")) || {};
      const shift = (x) => { if (!TF || !x.lv) return 0; const m = /^ev-(.+)$/.exec(x.tag || ""), r = m && TF[m[1]], w = m && c.watch.find((y) => y.id === m[1]);
        return r && w && r.al && r.dep === w.dep && r.d > 0 ? r.d * 60000 : 0; };
      // Le cron n'écrit jamais la fiche du couple : il note seulement ce qui est parti (clé à part)
      const doneList = await getDone(env, id, c), done = new Set(doneList);
      const due = list.filter((x) => x.at - shift(x) <= now + 20000 && !done.has(x.id));
      if (!due.length) continue;
      const subs = await getSubs(env, id, c);
      let changed = false;
      const sentCodes = [];
      for (const x of due) { const sh = shift(x), at = x.at - sh;
        if (now - at < 15 * 60000) { const r = await sendTo(env, subs, x.to, { title: x.title, body: sh ? clean(x.body + " Trafic : +" + Math.round(sh / 60000) + " min.", 300) : x.body, tag: x.tag }); changed = changed || r.changed; for (const cd of r.codes) sentCodes.push({ ...cd, tag: x.tag }); }
        doneList.push(x.id); done.add(x.id); }
      try { await logSends(env, id, "s", sentCodes); } catch (_) {}
      await putDone(env, id, doneList);
      if (changed) await putSubs(env, id, subs);
    }
  },
};
