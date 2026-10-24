import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PROJECT_REF = "vbqjvmnhdtdhmeeudqnn";
const FUNCTION_NAME = "chatb2k-omnidimensional-control-plane";
const CEO = "ceo@resofit.fit";
const FALLBACK = "resonancefitnesswork@gmail.com";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "https://dashboard.resofit.fit",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-request-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const routeUrl = (slug: string) => SUPABASE_URL + "/functions/v1/" + slug;
const isoNow = () => new Date().toISOString();
const safeError = (e: unknown) => e instanceof Error ? e.message.slice(0, 220) : "unknown_error";
const redact = (value: any): any => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (/secret|token|password|credential|authorization|api.?key|private.?key/i.test(k)) out[k] = "[REDACTED]";
    else out[k] = redact(v);
  }
  return out;
};

type Actor = { id: string; email: string; roles: string[]; isCEO: boolean; isFallback: boolean; isAdmin: boolean };

async function authenticate(req: Request): Promise<{ actor?: Actor; response?: Response }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token || !SERVICE_KEY) return { response: json({ ok: false, error: "AUTH_REQUIRED" }, 401) };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { response: json({ ok: false, error: "INVALID_SESSION" }, 401) };
  const email = String(data.user.email || "").toLowerCase();
  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", data.user.id);
  const roles = (roleRows || []).map((r: any) => String(r.role || "").toLowerCase());
  const isCEO = email === CEO, isFallback = email === FALLBACK;
  const isAdmin = isCEO || isFallback || roles.some((r: string) => ["admin", "super_admin"].includes(r));
  if (!isAdmin) return { response: json({ ok: false, error: "ADMIN_REQUIRED" }, 403) };
  return { actor: { id: data.user.id, email, roles, isCEO, isFallback, isAdmin } };
}
async function audit(actor: Actor, action: string, resource: string, metadata: Record<string, unknown> = {}) {
  await db.from("admin_audit_logs").insert({ user_id: actor.id, action, resource, metadata: { endpoint: FUNCTION_NAME, actor_email: actor.email, ...metadata } });
}
async function persistRun(runKey: string, status: string, report: Record<string, unknown>, counts: Record<string, unknown> = {}) {
  const { data, error } = await db.from("chatb2k_automation_runs").insert({
    run_key: runKey, engine: FUNCTION_NAME, status, completed_at: isoNow(), counts, report,
  }).select("id,run_key,status,started_at,completed_at").single();
  if (error) throw error;
  return data;
}
function envPresent(name: string) { return Boolean(Deno.env.get(name)?.trim()); }
function safeRoute(route: any) {
  const c = route.config && typeof route.config === "object" ? route.config : {};
  return {
    route_id: route.route_id, provider: route.provider, service_type: route.service_type, status: route.status,
    endpoint_class: route.endpoint_class, fallback_provider: route.fallback_provider,
    enabled: c.enabled === true, approved: c.approved === true,
    health_status: c.health_status || "not_recorded", last_verified_at: c.last_verified_at || null,
    required_env_names: Array.isArray(c.required_env_names) ? c.required_env_names.filter((x: unknown) => typeof x === "string") : [],
  };
}
async function inventory() {
  const [sources, routes, agents, control] = await Promise.all([
    db.from("resofit_ecosystem_source_registry").select("theme,canonical_url,runtime_ok,runtime_status,verified_at,verification_method,metadata,updated_at").order("updated_at", { ascending: false }).limit(500),
    db.from("chatb2k_provider_routes").select("route_id,provider,service_type,status,endpoint_class,fallback_provider,config,updated_at").order("service_type"),
    db.from("chatb2k_agent_registry").select("agent_id,agent_code,name,domain,status,enabled,health_status,updated_at,kill_switch_enabled").order("agent_id").limit(500),
    db.from("chatb2k_control_plane").select("id,kill_switch_enabled,kill_switch_reason,kill_switched_at,updated_at").eq("id", true).maybeSingle(),
  ]);
  const errors = [sources.error, routes.error, agents.error].filter(Boolean).map((e: any) => e.message);
  const src = sources.data || [], rt = routes.data || [], ag = agents.data || [];
  return {
    generated_at: isoNow(), project_ref: PROJECT_REF,
    inventory: {
      registered_sources: src.length, provider_routes: rt.length, registered_agents: ag.length,
      source_runtime_ok: src.filter((s: any) => s.runtime_ok).length,
      source_runtime_unverified_or_failed: src.filter((s: any) => !s.runtime_ok).length,
      deployed_function_count: null,
      deployed_function_count_note: "Registry rows are not proof of deployed functions. SUPABASE_ACCESS_TOKEN enables a live Management API inventory.",
    },
    global_control: control.data || { kill_switch_enabled: null, note: "Control-plane row not found." },
    routes: rt.map(safeRoute),
    agents: ag.map((a: any) => ({ agent_id:a.agent_id,agent_code:a.agent_code,name:a.name,domain:a.domain,status:a.status,enabled:a.enabled,health_status:a.health_status,kill_switch_enabled:a.kill_switch_enabled,updated_at:a.updated_at })),
    sources: src.map((s: any) => ({ theme:s.theme,canonical_url:s.canonical_url,runtime_ok:s.runtime_ok,runtime_status:s.runtime_status,verified_at:s.verified_at,verification_method:s.verification_method,updated_at:s.updated_at,metadata:redact(s.metadata) })),
    errors,
  };
}
async function secretInventory(actor: Actor) {
  const { data: routes, error } = await db.from("chatb2k_provider_routes").select("config");
  if (error) throw error;
  const refs = new Set<string>();
  for (const route of routes || []) {
    const c = route.config && typeof route.config === "object" ? route.config : {};
    for (const name of Array.isArray(c.required_env_names) ? c.required_env_names : []) {
      if (typeof name === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(name)) refs.add(name);
    }
  }
  ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_ACCESS_TOKEN","GEMINI_API_KEY","GEMINI_AUTOMATION_API_KEY","BUFFER_ACCESS_TOKEN","BUFFER_API_KEY","DROPBOX_ACCESS_TOKEN","GOOGLE_DRIVE_CLIENT_ID","GOOGLE_DRIVE_CLIENT_SECRET","GOOGLE_DRIVE_REFRESH_TOKEN","TELEGRAM_BOT_TOKEN","TELEGRAM_CHAT_ID","VERCEL_API_TOKEN","GITHUB_TOKEN","CLOUDFLARE_API_TOKEN","IMAGEKIT_PRIVATE_KEY","FIRECRAWL_API_KEY","WHATSAPP_BAILEYS_API_KEY"].forEach((n) => refs.add(n));
  const references = [...refs].sort().map((name) => ({ variable_name:name, present_in_this_function_runtime:envPresent(name), note:"Presence only; does not prove other projects or Vault copies match." }));
  await audit(actor, "secret_reference_inventory", FUNCTION_NAME, { references_checked:references.length, values_returned:false });
  return { checked_at:isoNow(), values_exposed:false, cross_project_drift_detection:"not_proven_without provider-side secret metadata access", references };
}
async function mediaRouting() {
  const { data, error } = await db.from("chatb2k_provider_routes").select("route_id,provider,service_type,status,endpoint_class,fallback_provider,config,updated_at").or("service_type.ilike.%media%,service_type.ilike.%storage%,service_type.ilike.%cdn%,service_type.ilike.%transform%");
  if (error) throw error;
  const candidates = (data || []).map(safeRoute);
  return {
    generated_at:isoNow(), active_approved_media_routes:candidates.filter((r:any)=>r.status==="active"&&r.enabled&&r.approved),
    registered_media_routes:candidates,
    providers:[
      {provider:"Dropbox",use:"archive/source library",endpoint:"connected Dropbox connector or configured server-side token",requires:"provider authentication and path-level check"},
      {provider:"Google Drive",use:"secondary archive and business media folder",endpoint:routeUrl("drive-asset-archiver"),requires:"OAuth token proxy and folder access"},
      {provider:"Cloudflare R2 / media.resofit.fit",use:"canonical media CDN",endpoint:"https://media.resofit.fit",requires:"verified bucket binding, object presence and access policy"},
      {provider:"ImageKit",use:"image transformation and delivery",endpoint:routeUrl("imagekit-auth"),requires:"verified credentials and asset IDs"},
      {provider:"ChatB2K media router",use:"route selection, QA, processing and archive orchestration",endpoint:routeUrl("resofit-media-control-plane"),requires:"live route test and object-level result"},
    ],
    selection_policy:"Choose by verified object availability, provider health, permissions, latency, transformation support and cost; never by provider label alone.",
    no_media_write_performed:true,
  };
}
async function managementInventory() {
  const token = Deno.env.get("SUPABASE_ACCESS_TOKEN") || "";
  if (!token) return { configured:false, functions:null, note:"SUPABASE_ACCESS_TOKEN is not present in this function runtime; deployed-function inventory is not inferred from registry rows." };
  const response = await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/functions", {
    headers:{ Authorization:"Bearer " + token, Accept:"application/json" }, signal:AbortSignal.timeout(12000),
  });
  if (!response.ok) return { configured:true, ok:false, http_status:response.status, functions:null, note:"Management API did not return a successful inventory." };
  const payload = await response.json().catch(()=>[]);
  const functions = Array.isArray(payload) ? payload.map((f:any)=>({slug:f.slug||f.name,version:f.version??null,status:f.status??null,verify_jwt:f.verify_jwt??null,updated_at:f.updated_at??null,endpoint:routeUrl(String(f.slug||f.name||""))})) : [];
  return { configured:true,ok:true,count:functions.length,functions };
}
async function statusSnapshot(actor: Actor) {
  const report = await inventory();
  const since = new Date(Date.now()-7*86400000).toISOString();
  const [queues, attempts] = await Promise.all([
    db.from("content_queue").select("platform,status,created_at,scheduled_at,updated_at").gte("created_at",since).limit(5000),
    db.from("social_publish_attempts").select("status,provider,updated_at").gte("updated_at",since).limit(5000),
  ]);
  const byPlatform:Record<string,Record<string,number>>={}, byProvider:Record<string,Record<string,number>>={};
  for(const q of queues.data||[]){const p=String(q.platform||"unknown"),s=String(q.status||"unknown");byPlatform[p]||={};byPlatform[p][s]=(byPlatform[p][s]||0)+1;}
  for(const a of attempts.data||[]){const p=String(a.provider||"unknown"),s=String(a.status||"unknown");byProvider[p]||={};byProvider[p][s]=(byProvider[p][s]||0)+1;}
  const result={...report,publishing:{lookback_hours:168,queue_by_platform:byPlatform,attempts_by_provider:byProvider,errors:[queues.error?.message,attempts.error?.message].filter(Boolean)}};
  const run=await persistRun("snapshot:"+Date.now(),"completed",result,{sources:report.inventory.registered_sources,routes:report.inventory.provider_routes});
  await audit(actor,"ecosystem_status_snapshot",FUNCTION_NAME,{run_id:run.id,source_count:report.inventory.registered_sources,route_count:report.inventory.provider_routes});
  return {...result,persisted_run:run};
}
async function setKillSwitch(actor: Actor, enabled: boolean, reason: string) {
  if(!actor.isCEO&&!actor.isFallback)return json({ok:false,error:"KILL_SWITCH_RESTRICTED",allowed_accounts:[CEO,FALLBACK]},403);
  if(enabled&&!reason.trim())return json({ok:false,error:"reason_required_when_enabling_kill_switch"},400);
  const {data:existing,error:readError}=await db.from("chatb2k_control_plane").select("id,kill_switch_enabled,kill_switch_reason").eq("id",true).maybeSingle();
  if(readError)throw readError;
  if(!existing)return json({ok:false,error:"control_plane_row_missing",next_action:"Restore the canonical control-plane row before changing global state."},409);
  const {data:updated,error:updateError}=await db.from("chatb2k_control_plane").update({kill_switch_enabled:enabled,kill_switch_reason:enabled?reason.trim().slice(0,500):null,kill_switched_at:isoNow(),kill_switched_by:actor.id,updated_at:isoNow()}).eq("id",true).select("id,kill_switch_enabled,kill_switch_reason,kill_switched_at,updated_at").single();
  if(updateError)throw updateError;
  const {error:eventError}=await db.from("chatb2k_kill_switch_events").insert({scope:"global",target_id:null,enabled,reason:reason.trim().slice(0,500)||(enabled?"enabled":"disabled"),actor_user_id:actor.id});
  await audit(actor,"global_kill_switch_changed",FUNCTION_NAME,{enabled,reason:reason.slice(0,300),event_recorded:!eventError});
  return json({ok:true,action:"kill_switch",control_plane:updated,event_recorded:!eventError,note:"Consumers must honor this canonical flag; this endpoint does not pause individual Telegram, Meta or other fan-outs."});
}
async function proposeFunction(actor:Actor, body:Record<string,unknown>) {
  const slug=String(body.slug||"").trim().toLowerCase(),purpose=String(body.purpose||"").trim();
  if(!/^[a-z][a-z0-9-]{2,62}$/.test(slug)||!purpose)return json({ok:false,error:"valid_slug_and_purpose_required"},400);
  const integrations=Array.isArray(body.integrations)?body.integrations.filter((x:unknown)=>typeof x==="string").slice(0,30):[];
  const report={kind:"function_scaffold_request",slug,purpose:purpose.slice(0,2000),requested_by:actor.email,requester_user_id:actor.id,integrations,deployment_policy:"persisted proposal only; code generation, CI, security review and deployment must be separately verified",idempotency_key:"function-scaffold:"+slug,created_at:isoNow()};
  const run=await persistRun("function-scaffold:"+slug+":"+Date.now(),"proposed",report,{integrations:integrations.length});
  await audit(actor,"function_scaffold_proposed",slug,{run_id:run.id,purpose:purpose.slice(0,300)});
  return json({ok:true,persisted:true,proposal:report,run,note:"Records the request and evidence trail; does not dynamically deploy arbitrary code from an HTTP request."},202);
}
Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(!["GET","POST"].includes(req.method))return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const {actor,response}=await authenticate(req);if(response)return response;
  try{
    const body=req.method==="POST"?await req.json().catch(()=>({})): {};
    const action=String((body as any)?.action||new URL(req.url).searchParams.get("action")||"status");
    if(action==="health")return json({ok:true,endpoint:FUNCTION_NAME,project_ref:PROJECT_REF,checked_at:isoNow(),auth:"valid_admin_session_required"});
    if(action==="status"||action==="snapshot")return json({ok:true,action,...await statusSnapshot(actor!)});
    if(action==="inventory"){
      const [dbInventory,deployed]=await Promise.all([inventory(),managementInventory()]);
      const run=await persistRun("inventory:"+Date.now(),"completed",{db_inventory:dbInventory,deployed_inventory:deployed},{registered_sources:dbInventory.inventory.registered_sources,routes:dbInventory.inventory.provider_routes,deployed_functions:deployed.functions?.length??null});
      await audit(actor!,"ecosystem_inventory",FUNCTION_NAME,{run_id:run.id});
      return json({ok:true,action,db_inventory:dbInventory,deployed_inventory:deployed,persisted_run:run});
    }
    if(action==="media_routes")return json({ok:true,action,...await mediaRouting()});
    if(action==="secret_inventory")return json({ok:true,action,...await secretInventory(actor!)});
    if(action==="kill_switch"){
      if(req.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
      return await setKillSwitch(actor!,(body as any)?.enabled===true,String((body as any)?.reason||""));
    }
    if(action==="propose_function"){
      if(req.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
      return await proposeFunction(actor!,body as Record<string,unknown>);
    }
    if(action==="sync_state"){
      const snap=await inventory();
      const run=await persistRun("sync-state:"+Date.now(),"completed",{snapshot:snap,rsid_policy:"Preserve incoming RSID; never replace an existing RSID.",attribution_policy:"Preserve source, medium, campaign, content, click, session and UTM; append only missing values.",secret_policy:"Presence/reference metadata only; no secret values returned.",note:"Registry snapshot persisted. This does not imply external providers or every endpoint has been independently health-probed."},{sources:snap.inventory.registered_sources,routes:snap.inventory.provider_routes});
      await audit(actor!,"ecosystem_sync_snapshot",FUNCTION_NAME,{run_id:run.id});
      return json({ok:true,action,persisted_run:run,snapshot:snap,execution_claim:"registry_state_persisted; external_sync_not_claimed"});
    }
    return json({ok:false,error:"UNKNOWN_ACTION",supported_actions:["health","status","snapshot","inventory","media_routes","secret_inventory","kill_switch","propose_function","sync_state"]},400);
  }catch(e){return json({ok:false,error:"CONTROL_PLANE_ERROR",detail:safeError(e),endpoint:FUNCTION_NAME,checked_at:isoNow()},500);}
});
