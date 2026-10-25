import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

const PORT = Number(process.env.PORT || 8080);
const API_TOKEN = process.env.WHATSAPP_BRIDGE_TOKEN || "";
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || "/data/whatsapp-auth";
const DESTINATIONS = parseJson(process.env.WHATSAPP_DESTINATIONS || "{}");
const MEDIA_HOSTS = new Set((process.env.MEDIA_HOST_ALLOWLIST || "media.resofit.fit").split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
let sock;
let connected = false;
let lastDisconnect = null;
let starting = false;

function parseJson(value) {
  try { const result = JSON.parse(value); return result && typeof result === "object" ? result : {}; }
  catch { throw new Error("Invalid JSON environment configuration"); }
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(body);
}
async function readBody(req, max = 128_000) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > max) throw new Error("Request body too large");
  }
  return data ? JSON.parse(data) : {};
}
function authorized(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(API_TOKEN && token && safeEqual(token, API_TOKEN));
}
function mediaUrl(value) {
  if (!value) return null;
  const u = new URL(String(value));
  if (u.protocol !== "https:" || u.username || u.password || !MEDIA_HOSTS.has(u.hostname.toLowerCase())) {
    throw new Error("Media URL must use HTTPS and an allowlisted media host");
  }
  return u.toString();
}
async function startSocket() {
  if (starting) return;
  starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      browser: ["ResoFit ChatB2K", "Chrome", "120.0.0"]
    });
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", ({ connection, lastDisconnect: detail, qr }) => {
      if (qr) {
        console.log("WHATSAPP_PAIRING_QR_BEGIN");
        qrcode.generate(qr, { small: true });
        console.log("WHATSAPP_PAIRING_QR_END — scan with the authorized ResoFit WhatsApp account");
      }
      if (connection === "open") {
        connected = true;
        lastDisconnect = null;
        console.log("WhatsApp Web session connected");
      }
      if (connection === "close") {
        connected = false;
        lastDisconnect = String(detail?.error?.message || "connection_closed");
        const code = detail?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          setTimeout(() => startSocket().catch(err => console.error("Reconnect failed", err.message)), 3000);
        } else {
          console.error("WhatsApp session logged out; operator must re-pair the session");
        }
      }
    });
  } finally {
    starting = false;
  }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true, service: "resofit-whatsapp-baileys", connected, pairing: !connected, configuredDestinations: Object.keys(DESTINATIONS).length });
  }
  if (req.method === "GET" && url.pathname === "/v1/status") {
    if (!authorized(req)) return sendJson(res, 401, { ok: false, error: "unauthorized" });
    return sendJson(res, 200, { ok: true, connected, lastDisconnect, destinations: Object.entries(DESTINATIONS).map(([key, value]) => ({ key, type: value?.type || "unknown", configured: Boolean(value?.jid) })) });
  }
  if (req.method !== "POST" || url.pathname !== "/v1/send") {
    return sendJson(res, 404, { ok: false, error: "not_found" });
  }
  if (!authorized(req)) return sendJson(res, 401, { ok: false, error: "unauthorized" });
  if (!connected || !sock) return sendJson(res, 503, { ok: false, error: "whatsapp_session_not_connected" });
  try {
    const body = await readBody(req);
    const key = String(body.destination || "");
    const destination = DESTINATIONS[key];
    if (!destination || !destination.jid || !["group", "channel", "direct"].includes(destination.type)) {
      return sendJson(res, 422, { ok: false, error: "destination_not_configured" });
    }
    const text = String(body.text || "").trim();
    if (!text || text.length > 6000) return sendJson(res, 422, { ok: false, error: "text_required_or_too_long" });
    const image = mediaUrl(body.imageUrl);
    const message = image
      ? { image: { url: image }, caption: text }
      : { text, linkPreview: body.linkPreview !== false };
    const result = await sock.sendMessage(destination.jid, message);
    return sendJson(res, 200, { ok: true, destination: key, type: destination.type, messageId: result?.key?.id || null, acceptedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Send failed", error?.message || error);
    return sendJson(res, 400, { ok: false, error: error?.message || "send_failed" });
  }
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Baileys bridge listening on ${PORT}`);
  if (!API_TOKEN) console.error("CONFIG ERROR: WHATSAPP_BRIDGE_TOKEN is missing; send endpoint remains inaccessible");
  startSocket().catch(err => console.error("Initial WhatsApp connection failed", err.message));
});
