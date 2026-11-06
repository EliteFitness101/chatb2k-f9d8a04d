import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const clean = (v: unknown, max = 1200) => typeof v === "string" ? v.trim().slice(0, max) : "";
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
async function hmac(keyBytes: Uint8Array, message: string) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
async function equal(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function validate(initData: string, token: string) {
  const p = new URLSearchParams(initData), received = p.get("hash") ?? "", authDate = Number(p.get("auth_date") ?? "0");
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (!received || !Number.isFinite(authDate) || age < -60 || age > 86400) return null;
  const check = [...p.entries()].filter(([k]) => k !== "hash").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + "=" + v).join("\n");
  const secret = await hmac(new TextEncoder().encode(token), "WebAppData");
  if (!(await equal(hex(await hmac(secret, check)), received))) return null;
  let user: any; try { user = JSON.parse(p.get("user") ?? "null"); } catch { return null; }
  if (!user || !Number.isSafeInteger(Number(user.id))) return null;
  return { user, startParam: clean(p.get("start_param"), 128) };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!token) return json({ error: "Telegram Mini App authentication is not configured on this service." }, 503);
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "bootstrap") return json({ error: "Unsupported action" }, 400);
    const initData = clean(body?.initData, 8192);
    if (!initData) return json({ error: "Open this Mini App from Telegram." }, 401);
    const verified = await validate(initData, token);
    if (!verified) return json({ error: "Telegram identity could not be verified. Reopen the Mini App from your connected bot." }, 401);
    return json({
      ok: true, authenticated: true,
      user: { id: String(verified.user.id), first_name: clean(verified.user.first_name, 80), last_name: clean(verified.user.last_name, 80), username: clean(verified.user.username, 64), language_code: clean(verified.user.language_code, 16) },
      client: { display_name: "Verified Telegram member" },
      support_url: "https://t.me/resonancefitness_bot",
      start_param: verified.startParam, authenticated_at: new Date().toISOString()
    });
  } catch {
    return json({ error: "Telegram Mini App service temporarily unavailable." }, 503);
  }
});
