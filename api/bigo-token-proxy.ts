import {
  createCipheriv,
  createHash,
  createPublicKey,
  randomBytes,
  randomInt,
  verify,
} from "node:crypto";

const REPOSITORY = "EliteFitness101/chatb2k-f9d8a04d";
const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "chatb2k-live-pipeline";
const WORKFLOW_REF =
  `${REPOSITORY}/.github/workflows/bigo-live-automation.yml@refs/heads/main`;
const TOKEN_TIME_URL = "https://sec.bigo.sg/v1/webjs/t";
const TOKEN_STATUS_URL = "https://sec.bigo.sg/v1/webjs/status";
const ROOM_INFO_URL =
  "https://ta.bigo.tv/official_website/studio/getInternalStudioInfo";
const TOKEN_KEY = "undefinedval0x01";

type Jwk = Record<string, unknown> & { kid?: string };

let jwksCache: { expiresAt: number; keys: Jwk[] } | undefined;

function readHeader(req: any, name: string): string {
  const value = req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function decodePart(value: string): any {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

async function getJwks(): Promise<Jwk[]> {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const response = await fetch(`${ISSUER}/.well-known/jwks`, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("GITHUB_JWKS_UNAVAILABLE");
  const body = await response.json() as { keys?: Jwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error("GITHUB_JWKS_EMPTY");
  }
  jwksCache = { keys: body.keys, expiresAt: Date.now() + 5 * 60 * 1000 };
  return body.keys;
}

async function verifyWorkflowIdentity(req: any): Promise<boolean> {
  const authorization = readHeader(req, "authorization");
  if (!authorization.startsWith("Bearer ")) return false;
  const token = authorization.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const header = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return false;

    const now = Math.floor(Date.now() / 1000);
    const audienceOk = claims.aud === AUDIENCE ||
      (Array.isArray(claims.aud) && claims.aud.includes(AUDIENCE));
    if (
      claims.iss !== ISSUER ||
      !audienceOk ||
      claims.repository !== REPOSITORY ||
      claims.ref !== "refs/heads/main" ||
      claims.workflow_ref !== WORKFLOW_REF ||
      !Number.isFinite(Number(claims.exp)) ||
      Number(claims.exp) <= now ||
      (claims.nbf !== undefined && Number(claims.nbf) > now + 30)
    ) return false;

    const jwk = (await getJwks()).find((key) => key.kid === header.kid);
    if (!jwk) return false;
    const publicKey = createPublicKey({ key: jwk as any, format: "jwk" });
    return verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    return false;
  }
}

function encryptTokenPayload(payload: Record<string, unknown>): string {
  const salt = randomBytes(8);
  let digest = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  while (digest.length < 48) {
    previous = createHash("md5")
      .update(Buffer.concat([previous, Buffer.from(TOKEN_KEY, "utf8"), salt]))
      .digest();
    digest = Buffer.concat([digest, previous]);
  }
  const cipher = createCipheriv(
    "aes-256-cbc",
    digest.subarray(0, 32),
    digest.subarray(32, 48),
  );
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from("Salted__", "ascii"), salt, encrypted])
    .toString("base64");
}

function callbackName(): string {
  return `jsonpcallback_${Date.now()}_${randomInt(0, 1_000_001)}`;
}

async function fetchJsonp(url: URL): Promise<any> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "python-requests/2.32.5",
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`BIGO_TOKEN_HTTP_${response.status}`);
  const raw = await response.text();
  const match = raw.match(/^jsonp\\w+\\(([\\s\\S]+?)\\);?\\s*$/);
  if (!match) throw new Error("BIGO_TOKEN_INVALID_JSONP");
  return JSON.parse(match[1]);
}

async function resolvePublicRoom(hostId: string): Promise<Record<string, unknown>> {
  const timeUrl = new URL(TOKEN_TIME_URL);
  timeUrl.searchParams.set("callback", callbackName());
  const timeData = await fetchJsonp(timeUrl);
  if (!timeData?.time) {
    return {
      ok: false,
      error: "BIGO_TOKEN_TIME_UNAVAILABLE",
      upstream_code: timeData?.code ?? null,
      upstream_info: String(timeData?.info ?? "").slice(0, 80),
    };
  }

  const payload = {
    dr: randomBytes(16).toString("hex"),
    business: "bigolive-video",
    scene: "",
    at_time: timeData.time,
    ver: "2.0",
  };
  const statusUrl = new URL(TOKEN_STATUS_URL);
  statusUrl.searchParams.set("callback", callbackName());
  statusUrl.searchParams.set("data", encryptTokenPayload(payload));
  const tokenData = await fetchJsonp(statusUrl);
  const token = String(tokenData?.token ?? "");
  if (!token) {
    return {
      ok: false,
      error: "BIGO_TOKEN_NOT_ISSUED",
      upstream_code: tokenData?.code ?? null,
      upstream_info: String(tokenData?.info ?? "").slice(0, 80),
    };
  }

  const roomUrl = new URL(ROOM_INFO_URL);
  roomUrl.searchParams.set("siteId", hostId);
  roomUrl.searchParams.set("verify", "");
  roomUrl.searchParams.set("token", token);
  const roomResponse = await fetch(roomUrl, {
    method: "POST",
    headers: {
      "User-Agent": "python-requests/2.32.5",
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!roomResponse.ok) {
    throw new Error(`BIGO_ROOM_INFO_HTTP_${roomResponse.status}`);
  }
  const roomPayload = await roomResponse.json() as any;
  if (roomPayload?.code !== 0) {
    return {
      ok: false,
      error: "BIGO_ROOM_INFO_REJECTED",
      upstream_code: roomPayload?.code ?? null,
      upstream_info: String(roomPayload?.msg ?? "").slice(0, 80),
      token_issued: true,
    };
  }

  const data = roomPayload.data ?? {};
  const hlsUrl = String(data.hls_src ?? "");
  if (hlsUrl) {
    const parsed = new URL(hlsUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error("BIGO_RETURNED_UNTRUSTED_HLS_URL");
    }
  }
  return {
    ok: true,
    token_issued: true,
    room_info_ok: true,
    alive: Boolean(hlsUrl),
    name: data.nick_name || data.clientBigoId || hostId,
    title: data.roomTopic || data.gameTitle || "BIGO Live Highlight",
    room_id: data.roomId || hostId,
    hls_src: hlsUrl,
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST_REQUIRED" });
  }
  if ((process.env.VERCEL_REGION ?? "") !== "bom1") {
    return res.status(503).json({
      ok: false,
      error: "BIGO_TOKEN_PROXY_WRONG_REGION",
      region: process.env.VERCEL_REGION ?? "unknown",
    });
  }
  if (!(await verifyWorkflowIdentity(req))) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED_WORKFLOW" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: "INVALID_JSON" });
    }
  }
  const hostId = String(body?.host_id ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(hostId)) {
    return res.status(400).json({ ok: false, error: "INVALID_HOST_ID" });
  }

  try {
    const result = await resolvePublicRoom(hostId);
    const status = result.ok === true ? 200 : 502;
    return res.status(status).json({
      ...result,
      host_id: hostId,
      region: process.env.VERCEL_REGION,
      authentication: "github_actions_oidc",
      cookie_required: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "BIGO_PROXY_FAILED";
    return res.status(502).json({
      ok: false,
      error: "BIGO_TOKEN_PROXY_FAILED",
      detail: message.slice(0, 100),
      host_id: hostId,
      region: process.env.VERCEL_REGION,
    });
  }
}
