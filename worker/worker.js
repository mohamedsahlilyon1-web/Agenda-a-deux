// Together : serveur de notifications (Cloudflare Workers, gratuit).
// Déploiement : 2026-10-20 (journal des envois et versions des téléphones, pour le diagnostic)
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
async function sendPush(env, sub, msg) {
  const body = await encryptPayload(sub, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, { method: "POST", body, headers: {
    "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high",
    ...(msg.tag ? { Topic: String(msg.tag).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "together" } : {}),
    Authorization: await vapidHeader(env, sub.endpoint) } });
  return r.status;
}
async function sendTo(env, subs, uids, msg) {
  let changed = false, sent = 0;
  const codes = [];
  for (const uid of uids) {
    const list = subs[uid] || [];
    const keep = [];
    if (!list.length) codes.push({ to: String(uid).slice(0, 4), st: -1 }); // aucun abonnement pour ce téléphone
    for (const s of list) {
      let st = 0; try { st = await sendPush(env, s, msg); } catch (e) { st = 0; }
      codes.push({ to: String(uid).slice(0, 4), st });
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
  for (const c of entries) L.push({ at, k: kind, t: String(c.tag || "").split("-")[0].slice(0, 12), to: c.to, st: c.st });
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
const UID_RE = /^[A-Za-z0-9_-]{1,80}$/;
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
    if (path === "/api/w" && req.method === "GET") {
      const id = clean(url.searchParams.get("c"), 60), t = clean(url.searchParams.get("t"), 80);
      const c = id && await getCouple(env, id);
      if (!c || !t || c.token !== t) return json(req, { error: "unknown" }, 404);
      const u = clean(url.searchParams.get("u"), 80), W = await getWidgets(env, id, c);
      return json(req, { at: W.at || 0, data: (W.map[u] || Object.values(W.map)[0]) || null });
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
      const subs = await getSubs(env, id, c);
      const list = (subs[uid] || []).filter((x) => x.endpoint !== s.endpoint);
      list.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
      subs[uid] = list.slice(-3); await putSubs(env, id, subs);
      if (b.hello) { const r = await sendTo(env, subs, [uid], { title: "Notifications activées", body: "Together te préviendra ici, même quand l'app est fermée.", tag: "hello" }); if (r.changed) await putSubs(env, id, subs); }
      return json(req, { ok: true });
    }
    if (path === "/api/unsub") { const uid = clean(b.uid, 80), subs = await getSubs(env, id, c); if (subs[uid]) { subs[uid] = subs[uid].filter((x) => x.endpoint !== b.endpoint); await putSubs(env, id, subs); } return json(req, { ok: true }); }
    if (path === "/api/notify") {
      const to = (Array.isArray(b.to) ? b.to : [b.to]).map((x) => clean(x, 80)).filter(Boolean).slice(0, 2);
      const subs = await getSubs(env, id, c);
      const r = await sendTo(env, subs, to, { title: clean(b.title, 120), body: clean(b.body, 300), tag: clean(b.tag, 60), url: clean(b.url, 200) });
      if (r.changed) await putSubs(env, id, subs);
      try { await logSends(env, id, "n", r.codes.map((c) => ({ ...c, tag: b.tag }))); } catch (_) {}
      return json(req, { ok: true, sent: r.sent, codes: r.codes.map((c) => c.st) });
    }
    if (path === "/api/schedule") {
      const now = Date.now(), done = new Set(await getDone(env, id, c));
      c.sched = (Array.isArray(b.items) ? b.items : []).slice(0, 200).map((x) => ({ id: clean(x.id, 120), to: (Array.isArray(x.to) ? x.to : [x.to]).map((u) => clean(u, 80)).slice(0, 2), at: +x.at || 0, title: clean(x.title, 120), body: clean(x.body, 300), tag: clean(x.tag, 60) }))
        .filter((x) => x.id && x.at > now - 60000 && x.at < now + 40 * 86400000 && !done.has(x.id));
      // dernière synchronisation de chaque téléphone, avec la version de l'app (aide au diagnostic)
      const who = clean(b.uid, 80);
      if (who) { c.seen = c.seen && typeof c.seen === "object" ? c.seen : {}; c.seen[who] = { v: clean(b.v, 12) || "<51", at: now }; }
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
      const c = await getCouple(env, id); if (!c || !c.sched || !c.sched.length) continue;
      // Le cron n'écrit jamais la fiche du couple : il note seulement ce qui est parti (clé à part)
      const doneList = await getDone(env, id, c), done = new Set(doneList);
      const due = c.sched.filter((x) => x.at <= now + 20000 && !done.has(x.id));
      if (!due.length) continue;
      const subs = await getSubs(env, id, c);
      let changed = false;
      const sentCodes = [];
      for (const x of due) { if (now - x.at < 15 * 60000) { const r = await sendTo(env, subs, x.to, { title: x.title, body: x.body, tag: x.tag }); changed = changed || r.changed; for (const cd of r.codes) sentCodes.push({ ...cd, tag: x.tag }); } doneList.push(x.id); done.add(x.id); }
      try { await logSends(env, id, "s", sentCodes); } catch (_) {}
      await putDone(env, id, doneList);
      if (changed) await putSubs(env, id, subs);
    }
  },
};
