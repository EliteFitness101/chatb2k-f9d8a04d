const crypto = require("node:crypto");

const TOKEN_TIME_URL = "https://sec.bigo.sg/v1/webjs/t";
const TOKEN_STATUS_URL = "https://sec.bigo.sg/v1/webjs/status";
const ROOM_INFO_URL = "https://ta.bigo.tv/official_website/studio/getInternalStudioInfo";
const TOKEN_KEY = "undefinedval0x01";
const USER_AGENT = "Mozilla/5.0";

function jsonp(text) {
  const match = String(text).match(/^jsonp\\w+\\(([\\s\\S]+?)\\);?\\s*$/);
  if (!match) throw new Error("BIGO token service returned an invalid JSONP envelope");
  return JSON.parse(match[1]);
}

function encryptOpenSSL(data, passphrase) {
  const salt = crypto.randomBytes(8);
  let digest = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  while (digest.length < 48) {
    previous = crypto.createHash("md5")
      .update(Buffer.concat([previous, Buffer.from(passphrase, "utf8"), salt]))
      .digest();
    digest = Buffer.concat([digest, previous]);
  }
  const cipher = crypto.createCipheriv("aes-256-cbc", digest.subarray(0, 32), digest.subarray(32, 48));
  return Buffer.concat([
    Buffer.from("Salted__", "ascii"),
    salt,
    cipher.update(data),
    cipher.final(),
  ]).toString("base64");
}

function callback() {
  return `jsonpcallback_${Date.now()}_${crypto.randomInt(0, 1000001)}`;
}

async function readJsonp(url, cookie) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "*/*",
      ...(cookie ? { "Cookie": cookie } : {}),
    },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`BIGO token endpoint HTTP ${response.status}`);
  return jsonp(await response.text());
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const expected = process.env.CHATB2K_LIVE_INGEST_KEY || "";
  const supplied = String(req.headers["x-chatb2k-live-key"] || "");
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (!expected || expectedBytes.length !== suppliedBytes.length ||
      !crypto.timingSafeEqual(expectedBytes, suppliedBytes)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const hostId = String(req.body?.hostId || "").trim();
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(hostId)) {
    return res.status(400).json({ ok: false, error: "invalid_host_id" });
  }
  const cookie = typeof req.body?.cookieHeader === "string" ? req.body.cookieHeader.trim() : "";
  if (cookie.length > 8192 || /[\\r\\n]/.test(cookie)) {
    return res.status(400).json({ ok: false, error: "invalid_cookie_header" });
  }

  try {
    const timeUrl = new URL(TOKEN_TIME_URL);
    timeUrl.searchParams.set("callback", callback());
    const timeData = await readJsonp(timeUrl, cookie);
    if (!timeData.time) {
      return res.status(502).json({
        ok: false,
        error: "bigo_token_time_unavailable",
        upstream_code: timeData.code ?? null,
        upstream_info: String(timeData.info || "").slice(0, 80),
        region: process.env.VERCEL_REGION || "unknown",
      });
    }

    const payload = {
      dr: crypto.randomBytes(16).toString("hex"),
      business: "bigolive-video",
      scene: "",
      at_time: timeData.time,
      ver: "2.0",
    };
    const encrypted = encryptOpenSSL(Buffer.from(JSON.stringify(payload), "utf8"), TOKEN_KEY);
    const statusUrl = new URL(TOKEN_STATUS_URL);
    statusUrl.searchParams.set("callback", callback());
    statusUrl.searchParams.set("data", encrypted);
    const tokenData = await readJsonp(statusUrl, cookie);
    const token = String(tokenData.token || "");
    if (!token) {
      return res.status(502).json({
        ok: false,
        error: "bigo_token_not_issued",
        upstream_code: tokenData.code ?? null,
        upstream_info: String(tokenData.info || "").slice(0, 80),
        region: process.env.VERCEL_REGION || "unknown",
      });
    }

    const roomUrl = new URL(ROOM_INFO_URL);
    roomUrl.searchParams.set("siteId", hostId);
    roomUrl.searchParams.set("verify", "");
    roomUrl.searchParams.set("token", token);
    const roomResponse = await fetch(roomUrl, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://www.bigo.tv",
        "Referer": `https://www.bigo.tv/${encodeURIComponent(hostId)}`,
        ...(cookie ? { "Cookie": cookie } : {}),
      },
      body: "",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!roomResponse.ok) throw new Error(`BIGO room-info endpoint HTTP ${roomResponse.status}`);
    const roomPayload = await roomResponse.json();
    if (roomPayload.code !== 0) {
      return res.status(502).json({
        ok: false,
        error: "bigo_room_info_rejected",
        upstream_code: roomPayload.code ?? null,
        upstream_info: String(roomPayload.msg || "").slice(0, 80),
        token_issued: true,
        region: process.env.VERCEL_REGION || "unknown",
      });
    }

    const data = roomPayload.data || {};
    const hls = String(data.hls_src || data.hlsSrc || data.hls || "");
    if (hls && !/^https:\/\//i.test(hls)) throw new Error("BIGO returned a non-HTTPS stream URL");
    return res.status(200).json({
      ok: true,
      token_issued: true,
      room_info_ok: true,
      alive: Boolean(hls),
      name: data.nick_name || hostId,
      title: data.roomTopic || data.gameTitle || "BIGO Live Highlight",
      room_id: data.roomId || hostId,
      hls_src: hls,
      region: process.env.VERCEL_REGION || "unknown",
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "bigo_regional_resolution_failed",
      detail: String(error?.message || "upstream request failed").slice(0, 160),
      region: process.env.VERCEL_REGION || "unknown",
    });
  }
}
