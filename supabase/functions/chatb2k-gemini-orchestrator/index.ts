import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const UPSTREAM = "https://chatb2k.resofit.fit/api/internal/chatb2k/gemini-orchestrator";
const cors = {
  "Access-Control-Allow-Origin": "https://chatb2k.resofit.fit",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST_REQUIRED" }, 405);
  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+.+/i.test(authorization)) return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await req.json().catch(() => null);
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 12000) {
    return json({ ok: false, error: "PROMPT_REQUIRED_MAX_12000_CHARS" }, 400);
  }
  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: body.prompt }),
      signal: AbortSignal.timeout(150000),
      cache: "no-store",
    });
    const raw = await upstream.text();
    let result: unknown;
    try { result = JSON.parse(raw); } catch { result = { response_excerpt: raw.slice(0, 1500) }; }
    return json(result, upstream.status);
  } catch {
    return json({ ok: false, error: "CHATB2K_VERCEL_GEMINI_AUTOMATION_ROUTE_UNAVAILABLE" }, 502);
  }
});
