import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://chatb2k.resofit.fit",
  "https://chatb2k-lzufw9bmy-resonancefitnessng-2206.vercel.app",
  "https://chatb2k-git-feat-telegram-miniap-e9396b-resonancefitnessng-2206.vercel.app",
]);
const REQUIRED_ACTIVE_CLIENTS = 5;
const CREDENTIAL_RPC = "chatb2k_get_runtime_secret";
const CORS_BASE = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Vary": "Origin",
};

type Destination = {
  id: string;
  display_name: string;
  external_channel_id: string | null;
  auth_secret_ref: string;
  metadata: { bot_username?: string } | null;
};

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function headersFor(req: Request) {
  const headers = new Headers(CORS_BASE);
  const origin = req.headers.get("origin") ?? "";
  if (ALLOWED_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(req) });
}

function clean(value: unknown, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getServiceKey() {
  const namedKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys);
      if (typeof parsed?.default === "string" && parsed.default.length > 20) return parsed.default;
    } catch {
      // Fall through to the legacy injected key.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

async function hmac(keyBytes: Uint8Array, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function constantTimeEqual(a: string, b: string) {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

async function validateInitData(initData: string, token: string) {
  const params = new URLSearchParams(initData);
  const entries = [...params.entries()];
  const keys = new Set<string>();
  for (const [key] of entries) {
    if (keys.has(key)) return null;
    keys.add(key);
  }

  const receivedHash = params.get("hash") ?? "";
  const authDateText = params.get("auth_date") ?? "";
  if (!/^[0-9]{1,12}$/.test(authDateText) || !/^[a-f0-9]{64}$/i.test(receivedHash)) return null;

  const authDate = Number(authDateText);
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (!Number.isSafeInteger(authDate) || age < -60 || age > 86400) return null;

  const checkString = entries
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  // Telegram's bot-token validation: HMAC key = bot token, message = "WebAppData".
  const secretKey = await hmac(encoder.encode(token), "WebAppData");
  const calculatedHash = hex(await hmac(secretKey, checkString));
  if (!constantTimeEqual(calculatedHash, receivedHash.toLowerCase())) return null;

  let user: Record<string, unknown> | null = null;
  try {
    user = JSON.parse(params.get("user") ?? "null");
  } catch {
    return null;
  }
  if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) return null;

  return {
    user: {
      id: String(user.id),
      first_name: clean(user.first_name, 80),
      last_name: clean(user.last_name, 80),
      username: clean(user.username, 64),
      language_code: clean(user.language_code, 16),
    },
    startParam: clean(params.get("start_param"), 128),
  };
}

async function restHeaders(url: string, secretKey: string) {
  return {
    apikey: secretKey,
    Authorization: "Bearer " + secretKey,
    "Content-Type": "application/json",
  };
}

async function getVaultSecret(url: string, serviceKey: string, secretName: string) {
  const response = await fetch(url + "/rest/v1/rpc/" + CREDENTIAL_RPC, {
    method: "POST",
    headers: await restHeaders(url, serviceKey),
    body: JSON.stringify({ p_name: secretName }),
  });
  if (!response.ok) throw new Error("Vault credential accessor unavailable");
  const value = await response.json();
  return typeof value === "string" ? value : "";
}

async function getActiveDestinations(url: string, serviceKey: string): Promise<Destination[]> {
  const query = new URLSearchParams({
    select: "id,display_name,external_channel_id,auth_secret_ref,metadata",
    provider: "eq.telegram",
    platform: "eq.telegram",
    active: "eq.true",
    order: "created_at.asc",
  });
  const response = await fetch(url + "/rest/v1/social_destinations?" + query.toString(), {
    headers: await restHeaders(url, serviceKey),
  });
  if (!response.ok) throw new Error("Telegram client registry unavailable");
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Telegram client registry response invalid");
  return rows.filter((row) =>
    typeof row?.id === "string" &&
    typeof row?.display_name === "string" &&
    typeof row?.auth_secret_ref === "string" &&
    typeof row?.metadata?.bot_username === "string" &&
    row.metadata.bot_username.length > 0
  ) as Destination[];
}

async function verifyBotUsername(token: string, expectedUsername: string) {
  const response = await fetch("https://api.telegram.org/bot" + token + "/getMe");
  if (!response.ok) return false;
  const payload = await response.json();
  return payload?.ok === true &&
    typeof payload?.result?.username === "string" &&
    payload.result.username.toLowerCase() === expectedUsername.toLowerCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headersFor(req) });
  }
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const origin = req.headers.get("origin") ?? "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { error: "Origin not allowed" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = getServiceKey();
  if (!supabaseUrl || !serviceKey) {
    return json(req, { error: "Telegram Mini App service is not configured." }, 503);
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "bootstrap") return json(req, { error: "Unsupported action" }, 400);
    const initData = clean(body?.initData, 8192);
    if (!initData) return json(req, { error: "Open this Mini App from Telegram." }, 401);

    const destinations = await getActiveDestinations(supabaseUrl, serviceKey);
    if (destinations.length !== REQUIRED_ACTIVE_CLIENTS) {
      return json(req, { error: "Telegram client registry is not in its expected five-client state." }, 503);
    }

    const secretNames = destinations.map((destination) => destination.auth_secret_ref);
    if (new Set(secretNames).size !== REQUIRED_ACTIVE_CLIENTS) {
      return json(req, { error: "Telegram client credential references are ambiguous." }, 503);
    }

    const credentialPairs = await Promise.all(destinations.map(async (destination) => ({
      destination,
      token: await getVaultSecret(supabaseUrl, serviceKey, destination.auth_secret_ref),
    })));
    if (credentialPairs.some((pair) => pair.token.length < 20)) {
      return json(req, { error: "One or more connected Telegram bot credentials are unavailable." }, 503);
    }

    const matches = [];
    for (const pair of credentialPairs) {
      const verified = await validateInitData(initData, pair.token);
      if (verified) matches.push({ ...pair, verified });
    }
    if (matches.length === 0) {
      return json(req, { error: "Telegram identity could not be verified. Reopen the Mini App from your connected bot." }, 401);
    }
    if (matches.length !== 1) {
      return json(req, { error: "Telegram client identity is ambiguous. Access has been denied." }, 409);
    }

    const match = matches[0];
    const botUsername = clean(match.destination.metadata?.bot_username, 64).replace(/^@/, "");
    if (!botUsername || !(await verifyBotUsername(match.token, botUsername))) {
      return json(req, { error: "The connected bot credential does not match its registered client identity." }, 503);
    }

    return json(req, {
      ok: true,
      authenticated: true,
      user: match.verified.user,
      client: {
        destination_id: match.destination.id,
        display_name: match.destination.display_name,
        bot_username: botUsername,
      },
      support_url: "https://t.me/" + botUsername,
      start_param: match.verified.startParam,
      authenticated_at: new Date().toISOString(),
    });
  } catch {
    return json(req, { error: "Telegram Mini App service temporarily unavailable." }, 503);
  }
});
