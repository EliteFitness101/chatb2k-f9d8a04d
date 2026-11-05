import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const MCP_URL = `${SUPABASE_URL}/functions/v1/chatb2k-mcp`;
const AGENT = "antigravity-preview-09-2026";
const cors = {
  "Access-Control-Allow-Origin": "https://chatb2k.resofit.fit",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

async function authorize(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token || !SERVICE_KEY) return { ok: false as const, status: 401, error: "AUTH_REQUIRED" };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, status: 401, error: "INVALID_SESSION" };
  const email = String(data.user.email ?? "").toLowerCase();
  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", data.user.id);
  const roles = (roleRows ?? []).map((r: { role: string }) => String(r.role ?? "").toLowerCase());
  if (email !== "ceo@resofit.fit" && email !== "resonancefitnesswork@gmail.com" &&
      !roles.some((r: string) => ["admin", "super_admin"].includes(r))) {
    return { ok: false as const, status: 403, error: "ADMIN_REQUIRED" };
  }
  return { ok: true as const, token, user_id: data.user.id, email };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST_REQUIRED" }, 405);
  const auth = await authorize(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 12000) return json({ ok: false, error: "PROMPT_REQUIRED_MAX_12000_CHARS" }, 400);

  const { data: apiKey, error: keyError } = await db.rpc("chatb2k_get_runtime_secret", { p_name: "GEMINI_API_KEY" });
  if (keyError || typeof apiKey !== "string" || apiKey.length < 20) {
    return json({ ok: false, error: "GEMINI_API_KEY_NOT_AVAILABLE_IN_VAULT" }, 503);
  }

  const interactionBody = {
    agent: AGENT,
    environment: "remote",
    input: prompt,
    store: false,
    system_instruction: [
      "You are the Gemini orchestration agent for ChatB2K101 and the ResoFit ecosystem.",
      "Use the connected chatb2k_mcp tools as the authoritative source for ecosystem state.",
      "Never infer production readiness from registry names, configured flags, or stale memory; distinguish registered, deployed, reachable, integrated, executing and verified.",
      "The current gateway is read-only. You may inspect, verify, invoke only agent-allowlisted read tools, persist a registry snapshot, and create a function proposal.",
      "A function proposal is not code generation, deployment or execution. Do not claim any mutation, payment, publish, repository write, email send, deployment or fulfillment completed unless a dedicated authorized tool returns verified evidence.",
      "Never request, reveal, log or return secrets. Preserve RSID, UTM, correlation and idempotency identifiers when present.",
      "For unavailable capabilities, state the exact missing execution boundary and return an actionable proposal rather than simulating success."
    ].join(" "),
    tools: [{
      type: "mcp_server",
      name: "chatb2k_mcp",
      url: MCP_URL,
      headers: { Authorization: `Bearer ${auth.token}` },
    }],
  };

  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(interactionBody),
      signal: AbortSignal.timeout(145000),
    });
    const raw = await upstream.text();
    let result: Record<string, unknown>;
    try { result = JSON.parse(raw); } catch { result = { response_excerpt: raw.slice(0, 2000) }; }
    if (!upstream.ok) {
      console.error("gemini_interaction_failed", { status: upstream.status, actor: auth.email, response: raw.slice(0, 500) });
      return json({ ok: false, provider: "gemini_interactions_api", http_status: upstream.status, error: "GEMINI_INTERACTION_FAILED", detail: result }, 502);
    }
    return json({
      ok: true,
      provider: "gemini_interactions_api",
      agent: AGENT,
      mcp_server: "chatb2k_mcp",
      actor: auth.email,
      interaction_id: result.id ?? null,
      status: result.status ?? "completed",
      output_text: result.output_text ?? null,
      steps: result.steps ?? [],
      usage: result.usage ?? null,
      storage: "disabled_for_this_interaction",
    });
  } catch (e) {
    console.error("gemini_orchestrator_error", { actor: auth.email, error: e instanceof Error ? e.message : "unknown" });
    return json({ ok: false, error: "GEMINI_ORCHESTRATOR_UNAVAILABLE" }, 502);
  }
});
