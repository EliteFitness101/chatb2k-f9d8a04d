import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const MCP_URL = `${SUPABASE_URL}/functions/v1/chatb2k-mcp`;
const AGENT = "antigravity-preview-09-2026";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function authorize(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token || !SUPABASE_URL || !SERVICE_KEY) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const email = String(data.user.email ?? "").toLowerCase();
  const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", data.user.id);
  if (roleError) return null;
  const roles = (roleRows ?? []).map((r: { role: string }) => String(r.role ?? "").toLowerCase());
  const ceoRoot = ["ceo@resofit.fit", "resonancefitnesswork@gmail.com"].includes(email);
  if (!ceoRoot && !roles.some((r: string) => ["admin", "super_admin"].includes(r))) return null;
  return { user_id: data.user.id, email, roles, ceoRoot };
}

function b64url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createScopedMcpToken(userId: string, email: string, roles: string[]) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    sub: userId, email, roles, aud: "chatb2k-mcp", scope: "chatb2k:mcp",
    iat: now, exp: now + 300, jti: crypto.randomUUID(),
  })));
  const unsigned = header + "." + payload;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return unsigned + "." + b64url(new Uint8Array(signature));
}

export const Route = createFileRoute("/api/internal/chatb2k/gemini-orchestrator")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": "https://chatb2k.resofit.fit",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Cache-Control": "no-store",
      } }),
      POST: async ({ request }) => {
        const actor = await authorize(request);
        if (!actor) return json({ ok: false, error: "CEO_OR_ADMIN_SESSION_REQUIRED" }, 401);
        if (!actor.ceoRoot) return json({ ok: false, error: "CEO_ROOT_REQUIRED_FOR_OMNIDIMENSIONAL_EXECUTION" }, 403);
        const body = await request.json().catch(() => ({}));
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt || prompt.length > 12000) return json({ ok: false, error: "PROMPT_REQUIRED_MAX_12000_CHARS" }, 400);

        // This is the automation model credential. GEMINI_API_KEY remains reserved for internal
        // media generation/enrichment and is deliberately never used by this orchestrator.
        const automationKey = process.env.GEMINI_AUTOMATION_API_KEY?.trim();
        if (!automationKey || automationKey.length < 20) {
          return json({ ok: false, error: "GEMINI_AUTOMATION_API_KEY_NOT_CONFIGURED_IN_VERCEL_RUNTIME" }, 503);
        }
        const mcpToken = await createScopedMcpToken(actor.user_id, actor.email, actor.roles);
        const provider = body.provider === "openai" ? "openai" : "gemini";
        if (provider === "openai") {
          const openaiKey = process.env.OPENAI_API_KEY?.trim();
          if (!openaiKey || openaiKey.length < 20) return json({ ok: false, error: "OPENAI_API_KEY_NOT_CONFIGURED_IN_VERCEL_RUNTIME" }, 503);
          const openaiModel = process.env.OPENAI_MODEL?.trim() || "gpt-6-astra";
          try {
            const upstream = await fetch("https://api.openai.com/v1/responses", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + openaiKey },
              body: JSON.stringify({
                model: openaiModel,
                input: prompt,
                instructions: "You are the OpenAI secondary reasoning provider for ChatB2K101. Use the chatb2k_mcp remote MCP server for all ecosystem state and actions. ChatB2K101 is the CEO root controller. Preserve governance and kill switches. Never claim execution without provider evidence. Keep registered, configured, deployed, reachable, integrated, executing and verified distinct.",
                store: false,
                tools: [{
                  type: "mcp",
                  server_label: "chatb2k_mcp",
                  server_description: "Governed ChatB2K101 ecosystem gateway. Root-only repository writes, workflow dispatch and runtime-verified binding orchestration.",
                  server_url: MCP_URL,
                  authorization: mcpToken,
                  require_approval: "never",
                }],
              }),
              signal: AbortSignal.timeout(145000),
              cache: "no-store",
            });
            const raw = await upstream.text();
            let result: Record<string, unknown>;
            try { result = JSON.parse(raw); } catch { result = { response_excerpt: raw.slice(0, 1500) }; }
            if (!upstream.ok) {
              console.error("chatb2k_openai_orchestration_failed", { status: upstream.status, actor: actor.email });
              return json({ ok: false, provider: "openai", http_status: upstream.status, error: "OPENAI_RESPONSES_REQUEST_FAILED" }, 502);
            }
            return json({
              ok: true,
              provider: "openai",
              model: openaiModel,
              mcp_server: "chatb2k_mcp",
              actor: actor.email,
              response_id: result.id ?? null,
              status: result.status ?? "completed",
              output_text: result.output_text ?? null,
              output: result.output ?? [],
              usage: result.usage ?? null,
              credential_separation: { openai: "OPENAI_API_KEY", gemini_orchestration: "GEMINI_AUTOMATION_API_KEY", internal_media: "GEMINI_API_KEY" },
              storage: "disabled_for_this_interaction",
            });
          } catch (error) {
            console.error("chatb2k_openai_orchestration_route_error", { actor: actor.email, error: error instanceof Error ? error.message : "unknown" });
            return json({ ok: false, error: "OPENAI_ORCHESTRATION_UNAVAILABLE" }, 502);
          }
        }
        const interactionBody = {
          agent: AGENT,
          environment: "remote",
          input: prompt,
          store: false,
          system_instruction: [
            "You are the Gemini automation orchestrator for ChatB2K101 and the ResoFit ecosystem.",
            "Use chatb2k_mcp as the authoritative execution and evidence interface. Call agent_tool_list to discover the current root-authorized toolset, then agent_tool_invoke to use returned read, write, run, create and orchestration tools. The gateway enforces root authority and per-binding runtime verification.",
            "ChatB2K101 is the CEO root controller. Use only explicitly authorized tools and preserve the global and per-agent kill switches.",
            "Distinguish registered, configured, deployed, reachable, integrated, executing and verified.",
            "Never claim a write, deployment, publication, payment, ingestion or fulfillment succeeded without provider evidence.",
            "Never reveal credentials. Preserve RSID, UTM, correlation and idempotency identifiers.",
          ].join(" "),
          tools: [{
            type: "mcp_server",
            name: "chatb2k_mcp",
            url: MCP_URL,
            headers: { Authorization: `Bearer ${mcpToken}` },
          }],
        };
        try {
          const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": automationKey },
            body: JSON.stringify(interactionBody),
            signal: AbortSignal.timeout(145000),
            cache: "no-store",
          });
          const raw = await upstream.text();
          let result: Record<string, unknown>;
          try { result = JSON.parse(raw); } catch { result = { response_excerpt: raw.slice(0, 1500) }; }
          if (!upstream.ok) {
            console.error("chatb2k_gemini_automation_failed", { status: upstream.status, actor: actor.email });
            return json({ ok: false, provider: "gemini_automation_api", http_status: upstream.status, error: "GEMINI_AUTOMATION_INTERACTION_FAILED" }, 502);
          }
          return json({
            ok: true,
            provider: "gemini_automation_api",
            agent: AGENT,
            mcp_server: "chatb2k_mcp",
            actor: actor.email,
            interaction_id: result.id ?? null,
            status: result.status ?? "completed",
            output_text: result.output_text ?? null,
            steps: result.steps ?? [],
            usage: result.usage ?? null,
            credential_separation: { orchestrator: "GEMINI_AUTOMATION_API_KEY", internal_media: "GEMINI_API_KEY" },
            storage: "disabled_for_this_interaction",
          });
        } catch (error) {
          console.error("chatb2k_gemini_automation_route_error", { actor: actor.email, error: error instanceof Error ? error.message : "unknown" });
          return json({ ok: false, error: "GEMINI_AUTOMATION_UNAVAILABLE" }, 502);
        }
      },
    },
  },
});
