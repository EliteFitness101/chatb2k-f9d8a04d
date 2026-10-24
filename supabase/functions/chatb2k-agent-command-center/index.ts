import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "https://dashboard.resofit.fit",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const idNumber = (id: string) => {
  const match = /^chatb2k(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
};
const inScope = (id: string) => {
  const n = idNumber(id);
  return n !== null && n >= 101 && n <= 173;
};
const routeUrl = (route: string) => `${URL}/functions/v1/${route}`;
const TOOL_ENDPOINTS: Record<string, { url: string; access: string }> = {
  "catalog.search": { url: routeUrl("catalog-public"), access: "supabase-edge-function" },
  "storefront.products": { url: routeUrl("storefront-products"), access: "supabase-edge-function" },
  "intelligence.recommend": { url: routeUrl("chatb2k-recommend"), access: "supabase-edge-function" },
  "intelligence.route_agent": { url: routeUrl("chatb2k-agent-router"), access: "supabase-edge-function" },
  "ecosystem.discover": { url: routeUrl("resofit-network-discovery"), access: "supabase-edge-function" },
  "wellness.locate": { url: routeUrl("wellness-locator"), access: "supabase-edge-function" },
  "ecosystem.qa": { url: routeUrl("resofit-ecosystem-qa"), access: "supabase-edge-function" },
  "ecosystem.control_plane": { url: routeUrl("chatb2k-omnidimensional-control-plane"), access: "service-role-internal-read-only" },
  "vercel.projects.read": { url: "https://api.vercel.com/v9/projects?limit=100", access: "external-provider-token-required" },
  "github.repos.read": { url: "https://api.github.com/user/repos?per_page=100&sort=updated", access: "external-provider-token-required" },
  "resend.domains.read": { url: "https://api.resend.com/domains", access: "external-provider-token-required" },
};

async function authorize(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false as const, status: 401, error: "AUTH_REQUIRED" };
  const { data, error } = await db.auth.getUser(token);
  const user = data.user;
  if (error || !user) return { ok: false as const, status: 401, error: "INVALID_SESSION" };
  const email = String(user.email || "").toLowerCase();
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const roleList = (roles || []).map((r: any) => String(r.role || ""));
  const isCEO = email === "ceo@resofit.fit";
  const canRead = isCEO || roleList.some((r: string) => ["admin", "moderator", "super_admin"].includes(r));
  if (!canRead) return { ok: false as const, status: 403, error: "COMMAND_CENTER_ACCESS_DENIED" };
  return { ok: true as const, user, email, isCEO, roleList };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST_REQUIRED" }, 405);
  const auth = await authorize(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "snapshot");
    const actorId = auth.user.id;

    if (action === "set_agent_kill_switch" || action === "set_global_kill_switch") {
      if (!auth.isCEO) return json({ ok: false, error: "CEO_ROOT_AUTHORITY_REQUIRED" }, 403);
      const enabled = body.enabled === true;
      const reason = String(body.reason || "").trim();
      if (enabled && reason.length < 6) return json({ ok: false, error: "REASON_REQUIRED", detail: "Provide at least six characters for the audit reason." }, 400);
      const now = new Date().toISOString();
      if (action === "set_global_kill_switch") {
        const { error } = await db.from("chatb2k_control_plane").update({
          kill_switch_enabled: enabled, kill_switch_reason: enabled ? reason : null,
          kill_switched_at: enabled ? now : null, kill_switched_by: actorId, updated_at: now,
        }).eq("id", true);
        if (error) throw error;
        const { error: eventError } = await db.from("chatb2k_kill_switch_events").insert({
          scope: "global", target_id: "root", enabled, reason: enabled ? reason : null, actor_user_id: actorId,
        });
        if (eventError) throw eventError;
        await db.from("admin_audit_logs").insert({
          user_id: actorId, action: enabled ? "chatb2k.global_kill_switch.enabled" : "chatb2k.global_kill_switch.disabled",
          resource: "chatb2k_control_plane", metadata: { reason: enabled ? reason : null, actor_email: auth.email, source: "chatb2k-agent-command-center" },
        });
        return json({ ok: true, action, enabled, reason: enabled ? reason : null, changed_at: now });
      }

      const agentId = String(body.agent_id || "");
      if (!inScope(agentId)) return json({ ok: false, error: "AGENT_OUT_OF_SCOPE" }, 400);
      const { data: agent, error: readError } = await db.from("chatb2k_agent_registry")
        .select("agent_id,permission_level,enabled").eq("agent_id", agentId).maybeSingle();
      if (readError) throw readError;
      if (!agent) return json({ ok: false, error: "AGENT_NOT_REGISTERED", agent_id: agentId }, 404);
      const { error: agentError } = await db.from("chatb2k_agent_registry").update({
        kill_switch_enabled: enabled, kill_switch_reason: enabled ? reason : null,
        kill_switched_at: enabled ? now : null, kill_switched_by: actorId, updated_at: now,
      }).eq("agent_id", agentId);
      if (agentError) throw agentError;
      await db.from("chatb2k_orchestration_nodes").update({
        kill_switch_enabled: enabled, kill_switch_reason: enabled ? reason : null,
        kill_switched_at: enabled ? now : null, kill_switched_by: actorId, updated_at: now,
      }).eq("node_id", agentId);
      const { error: eventError } = await db.from("chatb2k_kill_switch_events").insert({
        scope: "agent", target_id: agentId, enabled, reason: enabled ? reason : null, actor_user_id: actorId,
      });
      if (eventError) throw eventError;
      await db.from("admin_audit_logs").insert({
        user_id: actorId, action: enabled ? "chatb2k.agent_kill_switch.enabled" : "chatb2k.agent_kill_switch.disabled",
        resource: agentId, metadata: { reason: enabled ? reason : null, actor_email: auth.email, permission_level: agent.permission_level, source: "chatb2k-agent-command-center" },
      });
      return json({ ok: true, action, agent_id: agentId, enabled, reason: enabled ? reason : null, changed_at: now });
    }

    if (action !== "snapshot") return json({ ok: false, error: "UNKNOWN_ACTION" }, 400);
    const [agentRes, nodeRes, aliasRes, runRes, taskRes, learningRes, killRes, auditRes, controlRes, functionRes] = await Promise.all([
      db.from("chatb2k_agent_registry").select("agent_id,agent_code,name,domain,purpose,description,status,version,model,allowed_tools,allowed_tables,allowed_routes,allowed_actions,permission_level,fallback_agent_id,max_tool_calls,enabled,health_status,last_tested_at,metadata,created_at,updated_at,contract,kill_switch_enabled,kill_switch_reason,kill_switched_at").order("agent_id"),
      db.from("chatb2k_orchestration_nodes").select("node_id,parent_node_id,layer,title,role_code,access_level,control_email,status,reporting_mode,provider_stack,capability_scope,created_at,updated_at,kill_switch_enabled,kill_switch_reason,kill_switched_at").order("node_id"),
      db.from("chatb2k_email_alias_registry").select("address,purpose,visibility,status,routing_target,updated_at").order("address"),
      db.from("chatb2k_automation_runs").select("id,run_key,engine,status,started_at,completed_at,counts,report").order("started_at", { ascending: false }).limit(500),
      db.from("chatb2k_automation_tasks").select("id,task_type,channel,due_at,priority,status,payload,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
      db.from("chatb2k_learning_events").select("id,platform,source,event_type,topic,confidence,action,created_at").order("created_at", { ascending: false }).limit(200),
      db.from("chatb2k_kill_switch_events").select("scope,target_id,enabled,reason,actor_user_id,created_at").order("created_at", { ascending: false }).limit(100),
      db.from("chatb2k_tool_gateway_audit").select("created_at,actor_role,actor_id,action,tool_name,request_id,outcome,http_status,latency_ms").order("created_at", { ascending: false }).limit(100),
      db.from("chatb2k_control_plane").select("kill_switch_enabled,kill_switch_reason,kill_switched_at,updated_at").eq("id", true).maybeSingle(),
      db.from("chatb2k_provider_routes").select("route_id,provider,service_type,status,owner_node_id,endpoint_class,config,updated_at").order("route_id"),
    ]);
    for (const r of [agentRes,nodeRes,aliasRes,runRes,taskRes,learningRes,killRes,auditRes,controlRes,functionRes]) if (r.error) throw r.error;
    const agents = (agentRes.data || []).filter((a: any) => inScope(a.agent_id)).sort((a: any,b: any) => idNumber(a.agent_id)! - idNumber(b.agent_id)!);
    const nodes = nodeRes.data || [];
    const aliases = aliasRes.data || [];
    const runs = runRes.data || [];
    const tasks = taskRes.data || [];
    const learning = learningRes.data || [];
    const killEvents = killRes.data || [];
    const audits = auditRes.data || [];
    const routeRows = functionRes.data || [];
    const agentIds = new Set(agents.map((a: any) => a.agent_id));
    const missing = Array.from({ length: 73 }, (_, i) => i + 101).map(n => "chatb2k" + n).filter(id => !agentIds.has(id));
    const byId = agents.map((a: any) => {
      const id = a.agent_id;
      const node = nodes.find((n: any) => n.node_id === id);
      const ownAliases = aliases.filter((e: any) => e.routing_target === id);
      const ownRuns = runs.filter((r: any) => String(r.run_key || "").includes(id) || JSON.stringify(r.counts || {}).includes(id) || JSON.stringify(r.report || {}).includes(id));
      const ownTasks = tasks.filter((t: any) => JSON.stringify(t.payload || {}).includes(id));
      const ownLearning = learning.filter((e: any) => JSON.stringify(e).includes(id));
      const lastRun = ownRuns[0] || null;
      const tools = Array.isArray(a.allowed_tools) ? a.allowed_tools : [];
      const routes = Array.isArray(a.allowed_routes) ? a.allowed_routes : [];
      return {
        ...a,
        assigned_email: a.metadata?.control_email || node?.control_email || null,
        email_aliases: ownAliases,
        node: node ? { parent_node_id: node.parent_node_id, layer: node.layer, access_level: node.access_level, status: node.status, provider_stack: node.provider_stack, capability_scope: node.capability_scope, kill_switch_enabled: node.kill_switch_enabled } : null,
        route_endpoints: routes.map((route: string) => ({ route, url: routeUrl(route) })),
        tool_endpoints: tools.map((tool: string) => ({ tool, ...(TOOL_ENDPOINTS[tool] || { url: "", access: "endpoint_not_registered" }) })),
        tools,
        historical: { matched_runs: ownRuns.length, last_run_at: lastRun?.started_at || null, latest_runs: ownRuns.slice(0, 10).map((r: any) => ({ id:r.id,run_key:r.run_key,engine:r.engine,status:r.status,started_at:r.started_at,completed_at:r.completed_at,counts:r.counts })), matched_tasks: ownTasks.length, latest_tasks: ownTasks.slice(0,10).map((t: any) => ({id:t.id,task_type:t.task_type,channel:t.channel,status:t.status,due_at:t.due_at,created_at:t.created_at})), matched_learning_events: ownLearning.length, latest_learning_events: ownLearning.slice(0,10) },
        runtime_evidence: ownRuns.length || ownTasks.length || ownLearning.length ? "historical_agent_id_match" : "no_agent_id_attribution_in_sample",
      };
    });
    const callable = agents.filter((a: any) => a.enabled === true && a.status === "ENABLED" && a.kill_switch_enabled !== true && a.health_status !== "FAILED").length;
    return json({
      ok: true, generated_at: new Date().toISOString(), source_project: "resonance-fitness", source_project_ref: "vbqjvmnhdtdhmeeudqnn",
      authority: { requested_root: "chatb2k101", caller_email: auth.email, can_control: auth.isCEO, global_kill_switch: controlRes.data?.kill_switch_enabled === true, global_kill_reason: controlRes.data?.kill_switch_reason || null, global_kill_switched_at: controlRes.data?.kill_switched_at || null },
      summary: { requested_agents: 73, registered_agents: agents.length, missing_agent_ids: missing, enabled_and_registry_callable: callable, disabled: agents.filter((a: any)=>a.enabled!==true || a.status!=="ENABLED").length, killed: agents.filter((a: any)=>a.kill_switch_enabled===true).length, unhealthy: agents.filter((a: any)=>a.health_status==="FAILED").length, agents_with_assigned_email: agents.filter((a: any)=>a.metadata?.control_email || nodes.some((n:any)=>n.node_id===a.agent_id&&n.control_email)).length, agents_with_tools: agents.filter((a: any)=>Array.isArray(a.allowed_tools)&&a.allowed_tools.length>0).length, agents_with_routes: agents.filter((a: any)=>Array.isArray(a.allowed_routes)&&a.allowed_routes.length>0).length, recent_run_records: runs.length, recent_task_records: tasks.length, learning_events: learning.length, kill_switch_events: killEvents.length, tool_gateway_audit_events: audits.length },
      agents: byId,
      routes: routeRows.map((r: any)=>({ ...r, endpoint_url: r.config?.endpoint || null })),
      recent_runs: runs.slice(0,100).map((r:any)=>({id:r.id,run_key:r.run_key,engine:r.engine,status:r.status,started_at:r.started_at,completed_at:r.completed_at,counts:r.counts})),
      recent_tasks: tasks.slice(0,100).map((t:any)=>({id:t.id,task_type:t.task_type,channel:t.channel,due_at:t.due_at,priority:t.priority,status:t.status,created_at:t.created_at,payload:t.payload})),
      recent_learning_events: learning.slice(0,100), kill_switch_events: killEvents, tool_gateway_audit: audits,
    });
  } catch (error) {
    console.error("chatb2k-agent-command-center", error);
    return json({ ok: false, error: "COMMAND_CENTER_QUERY_FAILED", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});