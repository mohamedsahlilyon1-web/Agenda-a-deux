// Together : serveur de notifications (Cloudflare Workers, gratuit).
// Déploiement : 2026-10-16T21:46Z
// Envoie les notifications Web Push aux iPhone et garde les rappels programmés.
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
async function sendTo(env, c, uids, msg) {
  let changed = false, sent = 0;
  for (const uid of uids) {
    const list = (c.subs && c.subs[uid]) || [];
    const keep = [];
    for (const s of list) {
      let st = 0; try { st = await sendPush(env, s, msg); } catch (e) { st = 0; }
      if (st === 404 || st === 410) { changed = true; continue; }
      if (st >= 200 && st < 300) sent++;
      keep.push(s);
    }
    if (c.subs && c.subs[uid] && keep.length !== list.length) c.subs[uid] = keep;
  }
  return { changed, sent };
}
const cors = (req) => ({ "Access-Control-Allow-Origin": ORIGIN_OK(req.headers.get("Origin")) ? (req.headers.get("Origin") || "*") : "null",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" });
const json = (req, o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) } });
const clean = (s, n) => String(s || "").slice(0, n || 200);

async function getCouple(env, id) { return (await env.KV.get("c:" + id, "json")) || null; }
async function putCouple(env, id, c) { await env.KV.put("c:" + id, JSON.stringify(c)); }
async function addIndex(env, id) { const idx = (await env.KV.get("index", "json")) || []; if (!idx.includes(id)) { idx.push(id); await env.KV.put("index", JSON.stringify(idx)); } }

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    const url = new URL(req.url), path = url.pathname;
    if (path === "/api/key") return json(req, { pub: (await vapidKeys(env)).pub });
    if (path === "/api/w" && req.method === "GET") {
      const id = clean(url.searchParams.get("c"), 60), t = clean(url.searchParams.get("t"), 80);
      const c = id && await getCouple(env, id);
      if (!c || !t || c.token !== t) return json(req, { error: "unknown" }, 404);
      const u = clean(url.searchParams.get("u"), 80);
      return json(req, { at: c.wAt || 0, data: (c.widgets && (c.widgets[u] || Object.values(c.widgets)[0])) || null });
    }
    if (req.method !== "POST") return json(req, { ok: true, service: "Together" });
    if (!ORIGIN_OK(req.headers.get("Origin"))) return json(req, { error: "origin" }, 403);
    let b; try { b = await req.json(); } catch (_) { return json(req, { error: "json" }, 400); }
    const id = clean(b.couple, 60), token = clean(b.token, 80);
    if (!/^[A-Za-z0-9_-]{6,60}$/.test(id) || token.length < 24) return json(req, { error: "auth" }, 401);
    let c = await getCouple(env, id);
    if (!c) { c = { token, subs: {}, sched: [] }; await addIndex(env, id); }
    else if (c.token !== token) return json(req, { error: "auth" }, 401);
    if (path === "/api/sub") {
      const uid = clean(b.uid, 80), s = b.sub;
      if (!uid || !s || !/^https:\/\//.test(s.endpoint || "") || !s.keys || !s.keys.p256dh || !s.keys.auth) return json(req, { error: "sub" }, 400);
      const list = (c.subs[uid] || []).filter((x) => x.endpoint !== s.endpoint);
      list.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
      c.subs[uid] = list.slice(-3); await putCouple(env, id, c);
      if (b.hello) await sendTo(env, c, [uid], { title: "Notifications activées", body: "Together te préviendra ici, même quand l'app est fermée.", tag: "hello" });
      return json(req, { ok: true });
    }
    if (path === "/api/unsub") { const uid = clean(b.uid, 80); if (c.subs[uid]) c.subs[uid] = c.subs[uid].filter((x) => x.endpoint !== b.endpoint); await putCouple(env, id, c); return json(req, { ok: true }); }
    if (path === "/api/notify") {
      const to = (Array.isArray(b.to) ? b.to : [b.to]).map((x) => clean(x, 80)).filter(Boolean).slice(0, 2);
      const r = await sendTo(env, c, to, { title: clean(b.title, 120), body: clean(b.body, 300), tag: clean(b.tag, 60), url: clean(b.url, 200) });
      if (r.changed) await putCouple(env, id, c);
      return json(req, { ok: true, sent: r.sent });
    }
    if (path === "/api/schedule") {
      const now = Date.now(), done = new Set(c.done || []);
      c.sched = (Array.isArray(b.items) ? b.items : []).slice(0, 200).map((x) => ({ id: clean(x.id, 120), to: (Array.isArray(x.to) ? x.to : [x.to]).map((u) => clean(u, 80)).slice(0, 2), at: +x.at || 0, title: clean(x.title, 120), body: clean(x.body, 300), tag: clean(x.tag, 60) }))
        .filter((x) => x.id && x.at > now - 60000 && x.at < now + 40 * 86400000 && !done.has(x.id));
      if (b.widget && b.uid) { c.widgets = c.widgets || {}; c.widgets[clean(b.uid, 80)] = b.widget; c.wAt = now; }
      await putCouple(env, id, c);
      return json(req, { ok: true, count: c.sched.length });
    }
    return json(req, { error: "path" }, 404);
  },
  // Chaque minute : envoie les rappels arrivés à l'heure
  async scheduled(ev, env) {
    const idx = (await env.KV.get("index", "json")) || [], now = Date.now();
    for (const id of idx) {
      const c = await getCouple(env, id); if (!c || !c.sched || !c.sched.length) continue;
      const due = c.sched.filter((x) => x.at <= now + 20000);
      if (!due.length) continue;
      const done = c.done || [];
      for (const x of due) { if (now - x.at < 15 * 60000) await sendTo(env, c, x.to, { title: x.title, body: x.body, tag: x.tag }); done.push(x.id); }
      c.sched = c.sched.filter((x) => x.at > now + 20000); c.done = done.slice(-300);
      await putCouple(env, id, c);
    }
  },
};
