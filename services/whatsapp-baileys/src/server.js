import express from "express";
import pino from "pino";
import { mkdir } from "node:fs/promises";
import { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeWASocket, Browsers } from "@whiskeysockets/baileys";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
const log = pino({ level: process.env.LOG_LEVEL || "info" });
const PORT = Number(process.env.PORT || 8080);
const SESSION_DIR = process.env.BAILEYS_SESSION_DIR || "/data/auth";
const API_KEY = process.env.PUBLISHER_API_KEY || "";
const DESTINATIONS = JSON.parse(process.env.WHATSAPP_DESTINATIONS_JSON || "{}");
let sock = null;
let connected = false;
let lastDisconnect = null;
let starting = false;
let reconnectTimer = null;
const idempotency = new Map();

function safeHttpsUrl(value) {
  try {
    const u = new URL(String(value || ""));
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : "";
  } catch { return ""; }
}
function auth(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!API_KEY || !token || token.length !== API_KEY.length) return res.status(401).json({ ok: false, error: "unauthorized" });
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) mismatch |= token.charCodeAt(i) ^ API_KEY.charCodeAt(i);
  if (mismatch) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; startSocket().catch(e => log.error({ err: e }, "reconnect failed")); }, 3000);
}
async function startSocket() {
  if (starting || connected) return;
  starting = true;
  try {
    await mkdir(SESSION_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    let version;
    try { ({ version } = await fetchLatestBaileysVersion()); } catch (e) { log.warn({ err: e }, "Could not fetch latest WhatsApp Web version; using library default"); }
    sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: log.child({ component: "baileys" }),
      browser: Browsers.ubuntu("Chrome"),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false
    });
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", ({ connection, lastDisconnect: ld, qr }) => {
      if (qr) log.info({ qr }, "WHATSAPP_PAIRING_QR: scan this QR in WhatsApp > Linked devices");
      if (connection === "open") { connected = true; lastDisconnect = null; log.info("WhatsApp Web session connected"); }
      if (connection === "close") {
        connected = false;
        lastDisconnect = String(ld?.error?.message || ld?.error || "connection closed");
        const code = ld?.error?.output?.statusCode;
        log.warn({ code, lastDisconnect }, "WhatsApp session disconnected");
        if (code !== DisconnectReason.loggedOut) scheduleReconnect();
        else log.error("WhatsApp session logged out; remove/re-pair session only through approved operator workflow");
      }
    });
  } catch (e) {
    log.error({ err: e }, "WhatsApp socket startup failed");
    scheduleReconnect();
  } finally { starting = false; }
}
app.get("/healthz", (_req, res) => res.json({ ok: true, service: "chatb2k-whatsapp-baileys", time: new Date().toISOString() }));
app.get("/readyz", (_req, res) => res.status(connected ? 200 : 503).json({ ok: connected, connected, lastDisconnect }));
app.get("/v1/status", auth, (_req, res) => res.json({
  ok: true, service: "chatb2k-whatsapp-baileys", connected, lastDisconnect,
  destinations: Object.entries(DESTINATIONS).map(([id, d]) => ({ id, type: d.type, configured: Boolean(d.jid), label: d.label || id })),
  time: new Date().toISOString()
}));
app.post("/v1/publish", auth, async (req, res) => {
  if (!connected || !sock) return res.status(503).json({ ok: false, error: "whatsapp_session_not_connected" });
  const { destination_id, text, image_url, fallback_url, idempotency_key } = req.body || {};
  const destination = DESTINATIONS[String(destination_id || "")];
  if (!destination?.jid || !["group", "channel", "direct"].includes(destination.type)) return res.status(400).json({ ok: false, error: "unknown_or_unsupported_destination" });
  const bodyText = String(text || "").trim();
  if (!bodyText) return res.status(400).json({ ok: false, error: "text_required" });
  if (bodyText.length > 60000) return res.status(413).json({ ok: false, error: "text_too_long" });
  const idem = String(idempotency_key || "").trim();
  if (idem && idempotency.has(idem)) return res.status(200).json({ ok: true, deduplicated: true, result: idempotency.get(idem) });
  try {
    const mediaUrl = safeHttpsUrl(image_url);
    const link = safeHttpsUrl(fallback_url);
    const caption = [bodyText, link && !bodyText.includes(link) ? link : ""].filter(Boolean).join("\n\n");
    let result;
    if (destination.type === "channel") {
      // Baileys newsletter APIs vary by release. Do not silently downgrade a Channel to a group send.
      if (typeof sock.newsletterSendMessage !== "function") return res.status(501).json({ ok: false, error: "baileys_newsletter_send_not_supported_by_installed_version" });
      if (mediaUrl) {
        const r = await fetch(mediaUrl, { redirect: "error", signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error("image_fetch_failed_" + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 8 * 1024 * 1024) throw new Error("image_exceeds_8mb_limit");
        const contentType = r.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) throw new Error("image_url_not_image");
        result = await sock.newsletterSendMessage(destination.jid, { image: buf, caption });
      } else result = await sock.newsletterSendMessage(destination.jid, { text: caption });
    } else {
      if (mediaUrl) {
        const r = await fetch(mediaUrl, { redirect: "error", signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error("image_fetch_failed_" + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 8 * 1024 * 1024) throw new Error("image_exceeds_8mb_limit");
        const contentType = r.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) throw new Error("image_url_not_image");
        result = await sock.sendMessage(destination.jid, { image: buf, caption });
      } else result = await sock.sendMessage(destination.jid, { text: caption });
    }
    const receipt = { destination_id, destination_type: destination.type, message_id: result?.key?.id || result?.messageId || null, accepted_at: new Date().toISOString() };
    if (idem) { idempotency.set(idem, receipt); if (idempotency.size > 5000) idempotency.delete(idempotency.keys().next().value); }
    log.info({ ...receipt }, "WhatsApp publish accepted by session");
    return res.status(202).json({ ok: true, receipt });
  } catch (e) {
    log.error({ err: e, destination_id }, "WhatsApp publish failed");
    return res.status(502).json({ ok: false, error: String(e?.message || "publish_failed") });
  }
});
app.listen(PORT, () => {
  log.info({ port: PORT, sessionDir: SESSION_DIR, configuredDestinations: Object.keys(DESTINATIONS).length }, "ChatB2K Baileys service starting");
  if (!API_KEY) log.error("PUBLISHER_API_KEY is missing; publishing endpoint will reject requests");
  startSocket().catch(e => log.error({ err: e }, "initial socket startup failed"));
});
process.on("SIGTERM", () => { connected = false; try { sock?.end(new Error("SIGTERM")); } catch {} process.exit(0); });
