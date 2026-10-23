import express from "express";
import Database from "better-sqlite3";
import pino from "pino";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import fs from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";

const logger = pino({ level: process.env.LOG_LEVEL || "info", redact: ["req.headers.authorization", "req.headers.x-baileys-worker-secret"] });
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb", strict: true }));

const PORT = Number(process.env.PORT || 3000);
const WORKER_API_KEY = required("WORKER_API_KEY");
const ADMIN_TOKEN = required("ADMIN_TOKEN");
const CALLBACK_URL = required("SUPABASE_CALLBACK_URL");

const AUTH_DIR = process.env.AUTH_DIR || "/data/auth";
const DATABASE_PATH = process.env.DATABASE_PATH || "/data/worker.sqlite";
const MAX_MEDIA_BYTES = Math.max(1024, Number(process.env.MAX_MEDIA_BYTES || 16 * 1024 * 1024));
const allowedMediaHosts = new Set((process.env.ALLOWED_MEDIA_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
let destinations;
try {
  destinations = JSON.parse(process.env.ALLOWED_DESTINATIONS || "{}");
} catch {
  throw new Error("ALLOWED_DESTINATIONS must be a JSON object");
}
if (!destinations || Array.isArray(destinations) || typeof destinations !== "object") {
  throw new Error("ALLOWED_DESTINATIONS must map destination IDs to exact WhatsApp JIDs");
}
const callback = new URL(CALLBACK_URL);
if (callback.protocol !== "https:" || callback.href !== "https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/whatsapp-baileys-dispatch") {
  throw new Error("SUPABASE_CALLBACK_URL must be the approved ResoFit dispatch URL");
}
if (callback.username || callback.password) throw new Error("Callback URL must not contain credentials");

const db = new Database(DATABASE_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    idempotency_key TEXT PRIMARY KEY,
    queue_id TEXT NOT NULL,
    destination_id TEXT NOT NULL,
    status TEXT NOT NULL,
    message_id TEXT,
    error_code TEXT,
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
// Migrate existing worker volumes without deleting durable idempotency records.
const jobColumns = new Set(db.pragma("table_info(jobs)").map(column => column.name));
if (!jobColumns.has("payload_json")) db.exec("ALTER TABLE jobs ADD COLUMN payload_json TEXT");
const getJob = db.prepare("SELECT * FROM jobs WHERE idempotency_key = ?");
const insertJob = db.prepare("INSERT INTO jobs (idempotency_key, queue_id, destination_id, status, payload_json) VALUES (?, ?, ?, 'queued', ?)");
const updateJob = db.prepare("UPDATE jobs SET status=?, message_id=?, error_code=?, updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?");
const queuedJobs = db.prepare("SELECT * FROM jobs WHERE status = 'queued' AND payload_json IS NOT NULL ORDER BY created_at ASC");

let sock;
let connected = false;
let loggedIn = false;
let reconnectTimer;
let reconnectDelay = 1000;

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}
function constantTimeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function auth(expected) {
  return (req, res, next) => {
    const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "") || req.get("x-baileys-worker-secret") || "";
    if (!constantTimeEqual(supplied, expected)) return res.status(401).json({ error: "unauthorized" });
    next();
  };
}
function cleanString(value, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validateJob(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_payload");
  const queueId = cleanString(body.queue_id, 160);
  const destinationId = cleanString(body.destination_id, 160);
  const idempotencyKey = cleanString(body.idempotency_key, 200);
  if (!queueId || !destinationId || !idempotencyKey) throw new Error("missing_required_fields");
  if (body.action !== "publish") throw new Error("unsupported_action");
  if (!["whatsapp", "whatsapp_group"].includes(body.platform)) throw new Error("unsupported_platform");
  if (body.callback_action !== "ack") throw new Error("unsupported_callback_action");
  if (body.callback_url !== CALLBACK_URL) throw new Error("callback_url_mismatch");
  const jid = destinations[destinationId];
  if (typeof jid !== "string" || !/^[0-9]+(?:-[0-9]+)?@(s\.whatsapp\.net|g\.us)$/.test(jid)) {
    throw new Error("destination_not_allowlisted");
  }
  const content = body.content && typeof body.content === "object" ? body.content : {};
  const title = cleanString(content.title, 500);
  const caption = cleanString(content.caption, 4000);
  const assetUrl = cleanString(content.asset_url, 2000);
  if (!title && !caption && !assetUrl) throw new Error("empty_content");
  if (body.platform === "whatsapp_group" && !jid.endsWith("@g.us")) throw new Error("group_platform_requires_group_jid");
  if (body.platform === "whatsapp" && !jid.endsWith("@s.whatsapp.net")) throw new Error("direct_platform_requires_direct_jid");
  return { queueId, destinationId, idempotencyKey, jid, platform: body.platform, title, caption, assetUrl };
}
async function downloadMedia(urlText) {
  const url = new URL(urlText);
  if (url.protocol !== "https:" || !allowedMediaHosts.has(url.hostname.toLowerCase())) {
    throw new Error("media_host_not_allowlisted");
  }
  if (url.username || url.password || url.port && url.port !== "443") throw new Error("invalid_media_url");
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (response.status >= 300 && response.status < 400) throw new Error("media_redirect_not_allowed");
  if (!response.ok) throw new Error("media_fetch_failed");
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const supported = new Map([
    ["image/jpeg", "image"], ["image/png", "image"], ["image/webp", "image"],
    ["video/mp4", "video"], ["application/pdf", "document"],
  ]);
  const mediaType = supported.get(type);
  if (!mediaType) throw new Error("unsupported_media_type");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_MEDIA_BYTES) throw new Error("media_too_large");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_MEDIA_BYTES) throw new Error("media_too_large");
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), mediaType, mimetype: type };
}
async function acknowledge(job, status, messageId = null, errorCode = null) {
  const payload = {
    action: "ack",
    queue_id: job.queueId,
    destination_id: job.destinationId,
    idempotency_key: job.idempotencyKey,
    status,
    message_id: messageId,
    platform: job.platform,
    destination: destinations[job.destinationId],
    ...(errorCode ? { error: errorCode } : {}),
  };
  const headers = { "content-type": "application/json" };
  headers["x-baileys-worker-secret"] = WORKER_API_KEY;
  const response = await fetch(CALLBACK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`callback_http_${response.status}`);
}
async function handleJob(job) {
  if (!sock || !connected || !loggedIn) throw new Error("whatsapp_session_not_ready");
  let message;
  if (job.assetUrl) {
    const media = await downloadMedia(job.assetUrl);
    const caption = [job.title, job.caption].filter(Boolean).join("\n\n").slice(0, 4000);
    if (media.mediaType === "image") message = { image: media.buffer, mimetype: media.mimetype, caption };
    else if (media.mediaType === "video") message = { video: media.buffer, mimetype: media.mimetype, caption };
    else message = { document: media.buffer, mimetype: media.mimetype, fileName: "ResoFit-attachment.pdf", caption };
  } else {
    message = { text: [job.title, job.caption].filter(Boolean).join("\n\n").slice(0, 4000) };
  }
  const sent = await sock.sendMessage(job.jid, message);
  if (!sent?.key?.id) throw new Error("send_unconfirmed");
  return sent.key.id;
}
async function startSocket() {
  try {
    await fs.mkdir(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    sock = makeWASocket({
      auth: state,
      logger: logger.child({ component: "baileys" }),
      browser: Browsers.ubuntu("ResoFit ChatB2K"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        connected = true;
        loggedIn = true;
        reconnectDelay = 1000;
        logger.info({ event: "whatsapp_connected" });
      }
      if (connection === "close") {
        connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        loggedIn = code !== DisconnectReason.loggedOut;
        logger.warn({ event: "whatsapp_disconnected", code });
        if (loggedIn) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(startSocket, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        } else {
          logger.error({ event: "whatsapp_logged_out", action: "admin_relink_required" });
        }
      }
    });
  } catch (error) {
    connected = false;
    logger.error({ event: "whatsapp_start_failed", code: error?.message || "unknown" });
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(startSocket, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }
}

app.get("/health", (_req, res) => {
  res.status(connected && loggedIn ? 200 : 503).json({
    service: "resofit-whatsapp-baileys-worker",
    status: connected && loggedIn ? "ready" : "not_ready",
    whatsapp_connected: connected,
    session_present: loggedIn,
    timestamp: new Date().toISOString(),
  });
});

app.post("/admin/pairing-code", auth(ADMIN_TOKEN), async (req, res) => {
  if (connected) return res.status(409).json({ error: "already_connected" });
  const phone = cleanString(req.body?.phone_number, 20).replace(/[^0-9]/g, "");
  if (!/^\d{10,15}$/.test(phone)) return res.status(400).json({ error: "invalid_phone_number" });
  try {
    if (!sock) await startSocket();
    if (!sock?.requestPairingCode) return res.status(503).json({ error: "socket_not_ready_retry" });
    const code = await sock.requestPairingCode(phone);
    return res.json({ pairing_code: code, expires_note: "Use this code in WhatsApp Linked Devices promptly. Do not share it." });
  } catch (error) {
    logger.warn({ event: "pairing_code_failed", code: error?.message || "unknown" });
    return res.status(503).json({ error: "pairing_code_unavailable" });
  }
});

async function processJob(job) {
  // A crash while queued is safe to resume. Once sending starts, delivery
  // outcome may be unknown, so never auto-send that job a second time.
  updateJob.run("sending", null, null, job.idempotencyKey);
  try {
    const messageId = await handleJob(job);
    updateJob.run("published", messageId, null, job.idempotencyKey);
    try {
      await acknowledge(job, "published", messageId);
    } catch (error) {
      logger.error({ event: "ack_failed", queue_id: job.queueId, code: error?.message || "unknown" });
    }
    logger.info({ event: "job_published", queue_id: job.queueId, destination_id: job.destinationId, message_id: messageId });
  } catch (error) {
    const code = cleanString(error?.message || "send_failed", 100);
    updateJob.run("failed", null, code, job.idempotencyKey);
    try {
      await acknowledge(job, "failed", null, code);
    } catch (ackError) {
      logger.error({ event: "failure_ack_failed", queue_id: job.queueId, code: ackError?.message || "unknown" });
    }
    logger.warn({ event: "job_failed", queue_id: job.queueId, destination_id: job.destinationId, code });
  }
}

async function recoverQueuedJobs() {
  for (const row of queuedJobs.all()) {
    try {
      const job = JSON.parse(row.payload_json);
      logger.info({ event: "recovering_queued_job", queue_id: row.queue_id });
      void processJob(job);
    } catch {
      updateJob.run("failed", null, "stored_payload_invalid", row.idempotency_key);
      logger.error({ event: "queued_job_recovery_failed", queue_id: row.queue_id });
    }
  }
  // Legacy rows from the pre-payload schema cannot safely be replayed.
  db.prepare("UPDATE jobs SET status='uncertain', error_code='legacy_processing_outcome_unknown', updated_at=CURRENT_TIMESTAMP WHERE status='processing'");
}

app.post("/jobs", auth(WORKER_API_KEY), async (req, res) => {
  let job;
  try {
    job = validateJob(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message || "invalid_job" });
  }
  const existing = getJob.get(job.idempotencyKey);
  if (existing) {
    const state = existing.status === "published" ? "published" :
      existing.status === "failed" ? "failed" : "submitted";
    return res.status(202).json({ accepted: true, duplicate: true, status: state,
      ...(existing.message_id ? { message_id: existing.message_id } : {}) });
  }
  try {
    insertJob.run(job.idempotencyKey, job.queueId, job.destinationId, JSON.stringify(job));
  } catch {
    const duplicate = getJob.get(job.idempotencyKey);
    if (duplicate) return res.status(202).json({ accepted: true, duplicate: true, status: "submitted" });
    return res.status(500).json({ error: "job_persistence_failed" });
  }
  res.status(202).json({ accepted: true, status: "submitted" });
  void processJob(job);
});

app.use((_req, res) => res.status(404).json({ error: "not_found" }));
app.listen(PORT, "0.0.0.0", () => {
  logger.info({ event: "http_listening", port: PORT });
  void startSocket();
  void recoverQueuedJobs();
});

process.on("SIGTERM", () => {
  clearTimeout(reconnectTimer);
  try { sock?.end(undefined); } catch {}
  db.close();
  process.exit(0);
});
