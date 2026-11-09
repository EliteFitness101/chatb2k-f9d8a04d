import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const CONTROL_URL = `${SUPABASE_URL}/functions/v1/chatb2k-omnidimensional-control-plane`;
const GATEWAY_URL = `${SUPABASE_URL}/functions/v1/chatb2k-ecosystem-tool-gateway`;
const PROTOCOL_VERSION = "2025-06-18";
const cors = {
  "Access-Control-Allow-Origin": "https://chatb2k.resofit.fit",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Mcp-Protocol-Version": PROTOCOL_VERSION,
};

type Actor = { id: string; email: string; roles: string[] };
const tools = [
  { name: "ecosystem_status", description: "Read the current ChatB2K ecosystem status snapshot. Reports registered state separately from verified runtime state.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ecosystem_inventory", description: "Read registered ecosystem sources, provider routes, agent registry and live deployed-function inventory where provider access is configured.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ecosystem_integration_health", description: "Probe the registered integration endpoints and return their observed health results.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ecosystem_media_routes", description: "Inspect configured media routing and provider readiness without moving or publishing media.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ecosystem_secret_inventory", description: "Check approved secret-reference presence only. Secret values are never returned.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ecosystem_sync_snapshot", description: "Persist a timestamped registry/control-plane snapshot. This does not mutate external providers or prove that all integrations are synchronized.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ecosystem_propose_function", description: "Create an audited function-scaffold proposal. This records a proposal only; it does not generate code, deploy or execute a function.", inputSchema: { type: "object", properties: { slug: { type: "string", minLength: 3, maxLength: 63 }, purpose: { type: "string", minLength: 1, maxLength: 2000 }, integrations: { type: "array", items: { type: "string" }, maxItems: 30 } }, required: ["slug", "purpose"], additionalProperties: false } },
  { name: "agent_tool_list", description: "List all read and governed execution tools authorized to a specific enabled ChatB2K agent identity; root-only operations are exposed only to the CEO super-admin node.", inputSchema: { type: "object", properties: { agent_id: { type: "string", minLength: 1, maxLength: 100 } }, required: ["agent_id"], additionalProperties: false } },
  { name: "agent_tool_invoke", description: "Invoke a tool authorized to an enabled ChatB2K agent. The gateway enforces root-only repository writes, workflow dispatch and runtime-verified binding orchestration; payment and email mutations remain separately gated.", inputSchema: { type: "object", properties: { agent_id: { type: "string", minLength: 1, maxLength: 100 }, tool: { type: "string", minLength: 1, maxLength: 120 }, input: { type: "object", additionalProperties: true } }, required: ["agent_id", "tool"], additionalProperties: false } },

];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}
function rpc(id: unknown, result: unknown) {
  return response({ jsonrpc: "2.0", id, result });
}
function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return response({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }, 200);
}
function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function authenticate(req: Request): Promise<Actor | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer[ \t]+(.+)$/i)?.[1] ?? "";
  if (!token || !SERVICE_KEY) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let claims: Record<string, unknown>;
  try { claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1]))); } catch { return null; }
  const now = Math.floor(Date.now() / 1000);
  const iat = Number(claims.iat ?? 0), exp = Number(claims.exp ?? 0);
  if (claims.aud !== "chatb2k-mcp" || claims.scope !== "chatb2k:mcp" ||
      !iat || exp <= now || exp - iat > 300 || iat > now + 30) return null;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signature = decodeBase64Url(parts[2]);
    const signatureBuffer = new ArrayBuffer(signature.byteLength);
    new Uint8Array(signatureBuffer).set(signature);
    const valid = await crypto.subtle.verify("HMAC", key, signatureBuffer, new TextEncoder().encode(parts[0] + "." + parts[1]));
    if (!valid) return null;
  } catch { return null; }
  const id = String(claims.sub ?? "");
  const email = String(claims.email ?? "").toLowerCase();
  if (!id || !email) return null;
  const { data: roleRows, error } = await db.from("user_roles").select("role").eq("user_id", id);
  if (error) return null;
  const roles = (roleRows ?? []).map((r: { role: string }) => String(r.role ?? "").toLowerCase());
  const isPrivileged = email === "ceo@resofit.fit" ||
    email === "resonancefitnesswork@gmail.com" ||
    roles.some((r: string) => ["admin", "super_admin"].includes(r));
  return isPrivileged ? { id, email, roles } : null;
}
async function auditTool(actor: Actor, toolName: string, requestId: string, outcome: string, httpStatus: number) {
  try {
    await db.from("admin_audit_logs").insert({
      user_id: actor.id,
      action: "chatb2k_mcp_tool_call",
      resource: toolName,
      metadata: { endpoint: "chatb2k-mcp", actor_email: actor.email, request_id: requestId, outcome, http_status: httpStatus },
    });
  } catch (e) { console.error("mcp_audit_failed", String(e)); }
}
async function controlPlane(actorToken: string, action: string, payload: Record<string, unknown> = {}) {
  const r = await fetch(CONTROL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${actorToken}`, apikey: SERVICE_KEY, "Content-Type": "application/json", "x-request-id": crypto.randomUUID() },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await r.text();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { data = { response_excerpt: raw.slice(0, 1000) }; }
  return { http_status: r.status, ok: r.ok, data };
}
async function gateway(payload: Record<string, unknown>, actor: Actor) {
  const agentId = String(payload.agent_id ?? "");
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const claims = btoa(JSON.stringify({ sub: actor.id, email: actor.email, aud: "chatb2k-ecosystem-tool-gateway", scope: "chatb2k:gateway:actor", agent_id: agentId, iat: now, exp: now + 60 })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const r = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json", "x-request-id": crypto.randomUUID(), "x-chatb2k-actor": assertion },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await r.text();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { data = { response_excerpt: raw.slice(0, 1000) }; }
  return { http_status: r.status, ok: r.ok, data };
}
async function runTool(name: string, args: Record<string, unknown>, actor: Actor) {
  const controlActions: Record<string, string> = {
    ecosystem_status: "status",
    ecosystem_inventory: "inventory",
    ecosystem_integration_health: "integration_health",
    ecosystem_media_routes: "media_routes",
    ecosystem_secret_inventory: "secret_inventory",
    ecosystem_sync_snapshot: "sync_state",
  };
  if (controlActions[name]) return await controlPlane(SERVICE_KEY, controlActions[name]);
  if (name === "ecosystem_propose_function") {
    const slug = String(args.slug ?? "").trim().toLowerCase();
    const purpose = String(args.purpose ?? "").trim();
    if (!/^[a-z][a-z0-9-]{2,62}$/.test(slug) || !purpose) throw new Error("VALID_SLUG_AND_PURPOSE_REQUIRED");
    const integrations = Array.isArray(args.integrations) ? args.integrations.filter((x: unknown) => typeof x === "string").slice(0, 30) : [];
    const now = new Date().toISOString();
    const report = { kind: "function_scaffold_request", slug, purpose: purpose.slice(0, 2000), requested_by: actor.email, requester_user_id: actor.id, integrations, deployment_policy: "persisted proposal only; code generation, CI, security review and deployment must be separately verified", idempotency_key: "function-scaffold:" + slug, created_at: now };
    const { data: run, error } = await db.from("chatb2k_automation_runs").insert({
      run_key: "mcp-function-scaffold:" + slug + ":" + crypto.randomUUID(),
      engine: "chatb2k-mcp", status: "proposed", completed_at: now,
      counts: { integrations: integrations.length }, report,
    }).select("id,run_key,status,started_at,completed_at").single();
    if (error) throw new Error("FUNCTION_PROPOSAL_PERSIST_FAILED");
    const { error: auditError } = await db.from("admin_audit_logs").insert({
      user_id: actor.id, action: "function_scaffold_proposed", resource: slug,
      metadata: { endpoint: "chatb2k-mcp", actor_email: actor.email, run_id: run.id, purpose: purpose.slice(0, 300) },
    });
    return { ok: true, persisted: true, proposal: report, run, audit_recorded: !auditError, note: "Proposal only; no code generation, deployment or execution occurred." };
  }
  if (name === "agent_tool_list" || name === "agent_tool_invoke") {
    const requestedAgentId = String(args.agent_id ?? "").trim();
    if (!requestedAgentId) throw new Error("AGENT_ID_REQUIRED");
    const { data: agent, error } = await db.from("chatb2k_agent_registry")
      .select("agent_id,permission_level,enabled,status,health_status,kill_switch_enabled")
      .eq("agent_id", requestedAgentId).maybeSingle();
    if (error || !agent || agent.enabled !== true || agent.status !== "ENABLED" ||
        agent.health_status === "FAILED" || agent.kill_switch_enabled === true) {
      throw new Error("AGENT_NOT_AUTHORIZED_OR_DISABLED");
    }
    const isRoot = ["ROOT", "GLOBAL_ADMIN"].includes(String(agent.permission_level));
    if (isRoot && (requestedAgentId !== "chatb2k101" || actor.email !== "ceo@resofit.fit")) {
      throw new Error("CEO_ROOT_IDENTITY_BINDING_REQUIRED");
    }
    if (!isRoot) throw new Error("NON_ROOT_ACTOR_BINDING_NOT_CONFIGURED");
    return await gateway({
      action: name === "agent_tool_list" ? "list_tools" : "invoke",
      agent_id: "chatb2k101",
      ...(name === "agent_tool_invoke" ? { tool: args.tool, input: args.input ?? {} } : {}),
    }, actor);
  }
  throw new Error("TOOL_NOT_FOUND");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return response({ error: "POST_REQUIRED" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return response({ error: "SERVER_NOT_CONFIGURED" }, 503);
  const actor = await authenticate(req);
  if (!actor) return response({ error: "ADMIN_SESSION_REQUIRED" }, 401);

  const body = await req.json().catch(() => null);
  if (!body || (Array.isArray(body) ? body.length > 20 : typeof body !== "object")) return response({ error: "INVALID_JSON_RPC" }, 400);
  const messages = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const message of messages) {
    const id = message?.id;
    const method = String(message?.method ?? "");
    const params = message?.params && typeof message.params === "object" ? message.params as Record<string, unknown> : {};
    if (method.startsWith("notifications/")) continue;
    if (message?.jsonrpc !== "2.0" || !method) {
      replies.push({ jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message: "Invalid Request" } });
      continue;
    }
    if (method === "initialize") {
      replies.push({ jsonrpc: "2.0", id, result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "chatb2k_mcp", version: "1.0.0" },
        instructions: "ChatB2K governed MCP. Read operations are available to authorized administrators. Function proposals are persisted only. The ecosystem read gateway remains read-only. The separate GitHub App bridge exposes CEO-root repository operations only inside the configured installation allowlist; all actions are audited and provider responses are returned as evidence.",
      }});
      continue;
    }
    if (method === "ping") {
      replies.push({ jsonrpc: "2.0", id, result: {} });
      continue;
    }
    if (method === "tools/list") {
      replies.push({ jsonrpc: "2.0", id, result: { tools } });
      continue;
    }
    if (method === "tools/call") {
      const name = String(params.name ?? "");
      const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? params.arguments as Record<string, unknown> : {};
      if (!tools.some(t => t.name === name)) {
        replies.push({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown tool" } });
        continue;
      }
      try {
        const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
        const result = await runTool(name, args, actor);
        const httpStatus = Number((result as { http_status?: number }).http_status ?? 200);
        await auditTool(actor, name, requestId, httpStatus < 400 ? "success" : "provider_error", httpStatus);
        const serialized = JSON.stringify(result);
        replies.push({ jsonrpc: "2.0", id, result: {
          content: [{ type: "text", text: serialized.slice(0, 18000) }],
          structuredContent: result,
          isError: (result as { ok?: boolean }).ok === false,
        }});
      } catch (e) {
        await auditTool(actor, name, req.headers.get("x-request-id") || crypto.randomUUID(), "error", 500);
        replies.push({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "TOOL_EXECUTION_FAILED" }) }], isError: true } });
      }
      continue;
    }
    replies.push({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  }
  if (!replies.length) return new Response(null, { status: 202, headers: cors });
  return response(Array.isArray(body) ? replies : replies[0]);
});
