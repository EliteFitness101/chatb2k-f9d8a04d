import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cors = {"Access-Control-Allow-Origin":"https://www.resofit.fit","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-request-id","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers:cors});
const INTERNAL_READ_TOOLS: Record<string,{slug:string;description:string}> = {
 "catalog.search":{slug:"catalog-public",description:"Read canonical public catalog data; no price mutation or checkout."},
 "storefront.products":{slug:"storefront-products",description:"Read storefront product data."},
 "intelligence.recommend":{slug:"chatb2k-recommend",description:"Generate product or wellness recommendations."},
 "intelligence.route_agent":{slug:"chatb2k-agent-router",description:"Select an enabled ChatB2K agent; does not execute that agent."},
 "ecosystem.discover":{slug:"resofit-network-discovery",description:"Read registered ecosystem discovery results."},
 "wellness.locate":{slug:"wellness-locator",description:"Look up wellness service/location results."},
 "ecosystem.qa":{slug:"resofit-ecosystem-qa",description:"Run registered ecosystem QA checks."},
 "ecosystem.control_plane":{slug:"chatb2k-omnidimensional-control-plane",description:"Unified read-only ecosystem status, persisted sync snapshots, publishing and AI budget telemetry, media routing recommendations, and secret-reference presence checks; global kill switch remains CEO/fallback only."}
};
const EXTERNAL_READ_TOOLS: Record<string,{category:string;env:string;url:string;headers:(token:string)=>Record<string,string>}> = {
 "vercel.projects.read":{category:"deployment_management",env:"VERCEL_API_TOKEN",url:"https://api.vercel.com/v9/projects?limit=100",headers:(t)=>({Authorization:"Bearer "+t})},
 "github.repos.read":{category:"source_control",env:"GITHUB_TOKEN",url:"https://api.github.com/user/repos?per_page=100&sort=updated",headers:(t)=>({Authorization:"Bearer "+t,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"})},
 "resend.domains.read":{category:"email_operations",env:"RESEND_API_KEY",url:"https://api.resend.com/domains",headers:(t)=>({Authorization:"Bearer "+t})}
};

const ROOT_WRITE_TOOLS: Record<string,{permission:string;description:string}> = {
 "github.app.status":{permission:"read",description:"Verify the installed ChatB2K GitHub App and actual installation repository scope."},
 "github.repo.read":{permission:"read",description:"Read repository resources through the installed ChatB2K GitHub App within the configured allowlist."},
 "github.repo.write":{permission:"write",description:"Create or update repository resources through the installed ChatB2K GitHub App within the configured allowlist."},
 "github.workflow.dispatch":{permission:"run",description:"Dispatch GitHub Actions workflows through the installed ChatB2K GitHub App."},
 "ecosystem.dispatch":{permission:"orchestrate",description:"Plan or execute batches against runtime-verified infrastructure bindings; configured-only bindings are reported as blocked."}
};
function b64url(bytes:Uint8Array){let binary="";for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replace(/=/g,"").replace(/\\+/g,"-").replace(/\\//g,"_");}
async function githubBridgeToken(){
 const now=Math.floor(Date.now()/1000);
 const header=b64url(new TextEncoder().encode(JSON.stringify({alg:"HS256",typ:"JWT"})));
 const payload=b64url(new TextEncoder().encode(JSON.stringify({sub:"chatb2k101",email:"ceo@resofit.fit",aud:"chatb2k-github-app-bridge",scope:"chatb2k:github-app:admin",iat:now,exp:now+300,jti:crypto.randomUUID()})));
 const unsigned=header+"."+payload;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(unsigned));
 return unsigned+"."+b64url(new Uint8Array(sig));
}
async function githubBridge(method:"GET"|"POST",payload?:Record<string,unknown>){
 const token=await githubBridgeToken();
 const r=await fetch("https://chatb2k.resofit.fit/api/internal/chatb2k/github-app",{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(30000),cache:"no-store"});
 const raw=await r.text();let data:unknown;try{data=JSON.parse(raw);}catch{data={response_excerpt:raw.slice(0,1500)};}
 return {status:r.status,ok:r.ok,data};
}
async function dispatchBindings(bindingIds:string[],mode:string,action:string,payload:Record<string,unknown>,idempotencyKey:string,agentId:string){
 if(bindingIds.length<1||bindingIds.length>25)throw new Error("BINDING_IDS_MUST_BE_1_TO_25");
 const results:Record<string,unknown>[]=[];
 for(const bindingId of [...new Set(bindingIds)]){
  const q=new URLSearchParams({select:"binding_id,system,repository,function_slug,cron_job_name,workflow_path,node_id,purpose,sync_mode,status",binding_id:"eq."+bindingId,limit:"1"});
  const r=await fetch(SUPABASE_URL+"/rest/v1/chatb2k_infrastructure_bindings?"+q.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
  if(!r.ok){results.push({binding_id:bindingId,ok:false,status:"registry_read_failed"});continue;}
  const rows=await r.json();const binding=rows[0];
  if(!binding){results.push({binding_id:bindingId,ok:false,status:"binding_not_found"});continue;}
  if(binding.binding_id==="ceo.command.node"){results.push({binding_id:bindingId,ok:false,status:"governance_binding_cannot_dispatch_itself"});continue;}
  if(mode==="plan"){results.push({binding_id:bindingId,ok:true,status:binding.status==="runtime_verified"?"dispatch_candidate":"not_runtime_verified",binding});continue;}
  if(binding.status!=="runtime_verified"){results.push({binding_id:bindingId,ok:false,status:"NOT_RUNTIME_VERIFIED",binding_status:binding.status});continue;}
  if(binding.function_slug){
   const slug=String(binding.function_slug);if(!/^[a-z][a-z0-9-]{2,62}$/.test(slug)){results.push({binding_id:bindingId,ok:false,status:"invalid_function_slug"});continue;}
   const upstream=await fetch(SUPABASE_URL+"/functions/v1/"+slug,{method:"POST",headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json","x-request-id":crypto.randomUUID(),"x-idempotency-key":idempotencyKey+":"+bindingId},body:JSON.stringify({...payload,action,idempotency_key:idempotencyKey+":"+bindingId,orchestrated_by:agentId}),signal:AbortSignal.timeout(60000)});
   const raw=await upstream.text();let data:unknown;try{data=JSON.parse(raw);}catch{data={response_excerpt:raw.slice(0,1500)};}
   results.push({binding_id:bindingId,ok:upstream.ok,status:upstream.status<400?"dispatched":"execution_failed",endpoint:slug,http_status:upstream.status,result:data});continue;
  }
  if(binding.repository&&binding.workflow_path){
   const path="/repos/"+String(binding.repository)+"/actions/workflows/"+String(binding.workflow_path)+"/dispatches";
   const bridge=await githubBridge("POST",{method:"POST",path,body:{ref:String(payload.ref??"main"),inputs:payload.inputs&&typeof payload.inputs==="object"?payload.inputs:{}}});
   results.push({binding_id:bindingId,ok:bridge.ok,status:bridge.ok?"workflow_dispatched":"workflow_dispatch_failed",http_status:bridge.status,result:bridge.data});continue;
  }
  results.push({binding_id:bindingId,ok:false,status:"NO_DIRECT_EXECUTOR",cron_job_name:binding.cron_job_name??null});
 }
 return {ok:results.every(x=>x.ok===true),agent_id:agentId,mode,action,idempotency_key:idempotencyKey,requested:bindingIds.length,results};
}
function claimsFromJwt(token:string):Record<string,unknown>|null{try{const p=token.split(".");if(p.length!==3)return null;const b=p[1].replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(atob(b.padEnd(Math.ceil(b.length/4)*4,"=")));}catch{return null;}}
async function audit(role:string,actor:string,agent:string,action:string,tool:string|null,rid:string,outcome:string,status:number,started:number,metadata:Record<string,unknown>={}){try{await fetch(SUPABASE_URL+"/rest/v1/chatb2k_tool_gateway_audit",{method:"POST",headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({actor_role:role,actor_id:actor,action,tool_name:tool,request_id:rid,outcome,http_status:status,latency_ms:Date.now()-started,metadata:{agent_id:agent,...metadata}})});}catch(e){console.error("audit_failed",String(e));}}
async function loadAgent(agentId:string){const u=SUPABASE_URL+"/rest/v1/chatb2k_agent_registry?select=agent_id,name,permission_level,enabled,status,health_status,allowed_tools,allowed_routes,allowed_actions,kill_switch_enabled&agent_id=eq."+encodeURIComponent(agentId)+"&limit=1";const r=await fetch(u,{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});if(!r.ok)throw new Error("AGENT_REGISTRY_UNAVAILABLE");const rows=await r.json();return rows[0]??null;}
async function callInternal(tool:string,input:Record<string,unknown>){const t=INTERNAL_READ_TOOLS[tool];if(!t)throw new Error("TOOL_NOT_ALLOWLISTED");const r=await fetch(SUPABASE_URL+"/functions/v1/"+t.slug,{method:"POST",headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},body:JSON.stringify(input)});const raw=await r.text();let data:unknown;try{data=JSON.parse(raw);}catch{data={response_text:raw.slice(0,2000)};}return {tool,endpoint:t.slug,status:r.status,ok:r.ok,data};}
async function callExternal(tool:string){const t=EXTERNAL_READ_TOOLS[tool];if(!t)return null;const token=Deno.env.get(t.env);if(!token)return {tool,configured:false,reason:t.env+"_missing"};const r=await fetch(t.url,{headers:t.headers(token)});return {tool,status:r.status,ok:r.ok,data:await r.json().catch(()=>({}))};}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST_REQUIRED"},405);
 const auth=req.headers.get("authorization")??"";const token=auth.startsWith("Bearer ")?auth.slice(7):"";const claims=claimsFromJwt(token);
 const role=String(claims?.role??"unknown");const actor=String(claims?.sub??"service-runtime");
 if(!claims||role!=="service_role"||!SERVICE_KEY||token!==SERVICE_KEY)return json({error:"FORBIDDEN",message:"Service-runtime authorization required."},403);
 const started=Date.now();const rid=req.headers.get("x-request-id")||crypto.randomUUID();
 let body:Record<string,unknown>;try{body=await req.json();}catch{return json({error:"INVALID_JSON",request_id:rid},400);}
 const action=String(body.action??"");const agentId=String(body.agent_id??"");
 if(!agentId)return json({error:"AGENT_ID_REQUIRED",request_id:rid},400);
 try{
  const agent=await loadAgent(agentId);
  if(!agent||agent.enabled!==true||agent.status!=="ENABLED"||agent.kill_switch_enabled===true||agent.health_status==="FAILED"){await audit(role,actor,agentId,action,null,rid,"agent_denied",403,started);return json({error:"AGENT_NOT_AUTHORIZED_OR_DISABLED",request_id:rid},403);}
  const allowed=Array.isArray(agent.allowed_tools)?agent.allowed_tools.map(String):[];
  const elevated=["ROOT","GLOBAL_ADMIN"].includes(String(agent.permission_level));
  const list=Object.entries(INTERNAL_READ_TOOLS).filter(([name])=>elevated||allowed.includes(name)).map(([name,v])=>({name,endpoint:v.slug,description:v.description,permission:"read_only"}));
  const ext=Object.entries(EXTERNAL_READ_TOOLS).filter(([name])=>elevated||allowed.includes(name)).map(([name,v])=>({name,category:v.category,permission:"read_only",configured:Boolean(Deno.env.get(v.env))}));
  const rootTools=elevated?Object.entries(ROOT_WRITE_TOOLS).map(([name,v])=>({name,permission:v.permission,description:v.description,configured:true})):[];
  if(action==="list_tools"){
   await audit(role,actor,agentId,action,null,rid,"success",200,started,{tool_count:list.length+ext.length});
   return json({ok:true,gateway:"ChatB2K Ecosystem Tool Gateway",version:2,project:"resonance-fitness",agent:{agent_id:agent.agent_id,name:agent.name,permission_level:agent.permission_level},request_id:rid,policy:{service_role_runtime_only:true,per_agent_registry_allowlist:true,root_super_admin_enabled:elevated,read_operations_enabled:true,repository_writes_enabled:elevated,workflow_dispatch_enabled:elevated,verified_edge_function_dispatch_enabled:elevated,batch_orchestration_enabled:elevated,dynamic_page_generation_via_repo_writes:elevated,external_ingest_growth_and_product_enrichment_via_verified_bindings:elevated,vercel_project_management_enabled:Boolean(Deno.env.get("VERCEL_API_TOKEN")),payment_mutations_enabled:false,email_sending_enabled:false},tools:[...list,...ext,...rootTools]});
  }
  if(action!=="invoke")return json({error:"UNKNOWN_ACTION",allowed_actions:["list_tools","invoke"],request_id:rid},400);
  const tool=String(body.tool??"");
  if(!elevated&&!allowed.includes(tool)){await audit(role,actor,agentId,action,tool,rid,"tool_denied",403,started);return json({error:"TOOL_NOT_AUTHORIZED_FOR_AGENT",tool,request_id:rid},403);}
  let result:unknown;
  const input=body.input&&typeof body.input==="object"&&!Array.isArray(body.input)?body.input as Record<string,unknown>:{};
  if(Object.hasOwn(INTERNAL_READ_TOOLS,tool)){result=await callInternal(tool,input);}
  else if(Object.hasOwn(ROOT_WRITE_TOOLS,tool)){
   if(!elevated){await audit(role,actor,agentId,action,tool,rid,"root_privilege_required",403,started);return json({error:"ROOT_SUPER_ADMIN_REQUIRED",tool,request_id:rid},403);}
   if(tool==="github.app.status")result=await githubBridge("GET");
   else if(tool==="github.repo.read"){
    const path=String(input.path??"");if(!path.startsWith("/repos/"))throw new Error("ALLOWLISTED_REPOSITORY_PATH_REQUIRED");
    result=await githubBridge("POST",{method:"GET",path});
   }else if(tool==="github.repo.write"){
    const method=String(input.method??"PUT").toUpperCase();const path=String(input.path??"");
    if(!["POST","PUT","PATCH"].includes(method)||!path.startsWith("/repos/"))throw new Error("REPOSITORY_WRITE_METHOD_OR_PATH_NOT_ALLOWED");
    result=await githubBridge("POST",{method,path,body:input.body&&typeof input.body==="object"?input.body:{}});
   }else if(tool==="github.workflow.dispatch"){
    const path=String(input.path??"");
    if(!/^\\/repos\\/[^/]+\\/[^/]+\\/actions\\/workflows\\/[^/]+\\/dispatches$/.test(path))throw new Error("WORKFLOW_DISPATCH_PATH_REQUIRED");
    result=await githubBridge("POST",{method:"POST",path,body:input.body&&typeof input.body==="object"?input.body:{ref:"main"}});
   }else if(tool==="ecosystem.dispatch"){
    const ids=Array.isArray(input.binding_ids)?input.binding_ids.map(String):[];
    const mode=String(input.mode??"plan");if(!["plan","execute"].includes(mode))throw new Error("DISPATCH_MODE_MUST_BE_PLAN_OR_EXECUTE");
    const actionName=String(input.action??"run");const payload=input.payload&&typeof input.payload==="object"&&!Array.isArray(input.payload)?input.payload as Record<string,unknown>:{};
    const key=String(input.idempotency_key??"");if(mode==="execute"&&key.length<8)throw new Error("IDEMPOTENCY_KEY_REQUIRED_FOR_EXECUTION");
    result=await dispatchBindings(ids,mode,actionName,payload,key,agentId);
   }
  }else{result=await callExternal(tool);if(result===null){await audit(role,actor,agentId,action,tool,rid,"tool_denied",403,started);return json({error:"TOOL_NOT_ALLOWLISTED",tool,request_id:rid},403);}}
  const item=result as Record<string,unknown>;const status=Number(item.status??200);const ok=item.configured===false?false:(item.ok!==false&&status<400);
  await audit(role,actor,agentId,action,tool,rid,ok?"success":"provider_error",status,started);
  return json({ok,request_id:rid,result},ok?200:502);
 }catch(e){const msg=e instanceof Error?e.message:String(e);await audit(role,actor,agentId,action,String(body.tool??"")||null,rid,"error",500,started,{error:msg});return json({error:"TOOL_GATEWAY_FAILED",request_id:rid},500);}
});
