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
  { name: "agent_tool_list", description: "List the read-only tools currently authorized to a specific enabled ChatB2K agent identity.", inputSchema: { type: "object", properties: { agent_id: { type: "string", minLength: 1, maxLength: 100 } }, required: ["agent_id"], additionalProperties: false } },
  { name: "agent_tool_invoke", description: "Invoke one tool already allowlisted to an enabled ChatB2K agent. The current gateway enforces read-only access; mutations, payments, deployments, repository writes and email sends are disabled.", inputSchema: { type: "object", properties: { agent_id: { type: "string", minLength: 1, maxLength: 100 }, tool: { type: "string", minLength: 1, maxLength: 120 }, input: { type: "object", additionalProperties: true } }, required: ["agent_id", "tool"], additionalProperties: false } },
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
async function authenticate(req: Request): Promise<Actor | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token || !SERVICE_KEY) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const email = String(data.user.email ?? "").toLowerCase();
  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", data.user.id);
  const roles = (roleRows ?? []).map((r: { role: string }) => String(r.role ?? "").toLowerCase());
  const isPrivileged = email === "ceo@resofit.fit" ||
    email === "resonancefitnesswork@gmail.com" ||
    roles.some((r: string) => ["admin", "super_admin"].includes(r));
  return isPrivileged ? { id: data.user.id, email, roles } : null;
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
async function gateway(payload: Record<string, unknown>) {
  const r = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json", "x-request-id": crypto.randomUUID() },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await r.text();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { data = { response_excerpt: raw.slice(0, 1000) }; }
  return { http_status: r.status, ok: r.ok, data };
}
async function runTool(name: string, args: Record<string, unknown>, token: string) {
  const controlActions: Record<string, string> = {
    ecosystem_status: "status",
    ecosystem_inventory: "inventory",
    ecosystem_integration_health: "integration_health",
    ecosystem_media_routes: "media_routes",
    ecosystem_secret_inventory: "secret_inventory",
    ecosystem_sync_snapshot: "sync_state",
  };
  if (controlActions[name]) return await controlPlane(token, controlActions[name]);
  if (name === "ecosystem_propose_function") {
    return await controlPlane(token, "propose_function", {
      slug: args.slug, purpose: args.purpose, integrations: args.integrations ?? [],
    });
  }
  if (name === "agent_tool_list") {
    return await gateway({ action: "list_tools", agent_id: args.agent_id });
  }
  if (name === "agent_tool_invoke") {
    return await gateway({ action: "invoke", agent_id: args.agent_id, tool: args.tool, input: args.input ?? {} });
  }
  throw new Error("TOOL_NOT_FOUND");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return response({ error: "POST_REQUIRED" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return response({ error: "SERVER_NOT_CONFIGURED" }, 503);
  const actor = await authenticate(req);
  if (!actor) return response({ error: "ADMIN_SESSION_REQUIRED" }, 401);

  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
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
        instructions: "ChatB2K governed MCP. Read operations are available to authorized administrators. Function proposals are persisted only. The connected agent gateway is read-only; no payment, deployment, repository-write, email-send or arbitrary mutation tool is exposed.",
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
        const result = await runTool(name, args, token);
        const serialized = JSON.stringify(result);
        replies.push({ jsonrpc: "2.0", id, result: {
          content: [{ type: "text", text: serialized.slice(0, 18000) }],
          structuredContent: result,
          isError: (result as { ok?: boolean }).ok === false,
        }});
      } catch (e) {
        replies.push({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "TOOL_EXECUTION_FAILED" }) }], isError: true } });
      }
      continue;
    }
    replies.push({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  }
  if (!replies.length) return new Response(null, { status: 202, headers: cors });
  return response(Array.isArray(body) ? replies : replies[0]);
});
