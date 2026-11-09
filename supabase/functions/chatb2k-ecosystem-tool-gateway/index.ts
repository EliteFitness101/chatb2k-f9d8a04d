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
 "ecosystem.dispatch":{permission:"orchestrate",description:"Plan or execute batches across all 72 non-governance bindings; only runtime-verified executors run."},
 "vercel.project.write":{permission:"write",description:"Create or update Vercel projects through the configured Vercel API token."},
 "vercel.deployment.create":{permission:"create",description:"Create a Vercel deployment for an authorized project."},
 "vercel.deployment.promote":{permission:"run",description:"Promote a verified Vercel deployment."}
};
function b64url(bytes:Uint8Array){let binary="";for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replaceAll("=","").replaceAll("+","-").replaceAll("/","_");}
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
async function callVercelApi(method:"POST"|"PATCH",path:string,body:Record<string,unknown>){
 const token=Deno.env.get("VERCEL_API_TOKEN")??"";
 if(!token)return {ok:false,status:503,data:{error:"VERCEL_API_TOKEN_NOT_CONFIGURED"}};
 const parts=path.split("/");
 const projectPatch=parts.length===4&&parts[1]==="v9"&&parts[2]==="projects"&&parts[3].length>0&&!parts[3].includes("/");
 const deploymentPromote=parts.length===5&&parts[1]==="v13"&&parts[2]==="deployments"&&parts[3].length>0&&!parts[3].includes("/")&&parts[4]==="promote";
 const allowed=(path==="/v10/projects"&&method==="POST")
  ||(projectPatch&&method==="PATCH")
  ||(path==="/v13/deployments"&&method==="POST")
  ||(deploymentPromote&&method==="POST");
 if(!allowed)throw new Error("VERCEL_API_PATH_NOT_ALLOWLISTED");
 const url=new URL("https://api.vercel.com"+path);
 url.searchParams.set("teamId","team_iRyfIbkZpnmY0x43nnOI0Q9I");
 const r=await fetch(url,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(45000),cache:"no-store"});
 const raw=await r.text();let data:unknown;try{data=JSON.parse(raw);}catch{data={response_excerpt:raw.slice(0,1500)};}
 return {ok:r.ok,status:r.status,data};
}
async function dispatchBindings(bindingIds:string[],mode:string,action:string,payload:Record<string,unknown>,idempotencyKey:string,agentId:string){
 if(bindingIds.length<1||bindingIds.length>(mode==="plan"?72:25))throw new Error("PLAN_LIMIT_72_EXECUTE_BATCH_LIMIT_25");
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
  if(binding.cron_job_name){
   const rpc=await fetch(SUPABASE_URL+"/rest/v1/rpc/chatb2k_run_verified_cron_job",{method:"POST",headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_agent_id:agentId,p_job_name:String(binding.cron_job_name),p_idempotency_key:idempotencyKey+":"+bindingId}),signal:AbortSignal.timeout(60000)});
   const raw=await rpc.text();let data:unknown;try{data=JSON.parse(raw);}catch{data={response_excerpt:raw.slice(0,1000)};}
   const result=(data&&typeof data==="object"&&!Array.isArray(data))?data as Record<string,unknown>:{};
   results.push({binding_id:bindingId,ok:result.ok===true,status:result.status??"cron_dispatch_failed",cron_job_name:binding.cron_job_name,result:data});continue;
  }
  results.push({binding_id:bindingId,ok:false,status:"NO_DIRECT_EXECUTOR"});
 }
 return {ok:results.every(x=>x.ok===true),agent_id:agentId,mode,action,idempotency_key:idempotencyKey,requested:bindingIds.length,results};
}
function claimsFromJwt(token:string):Record<string,unknown>|null{try{const p=token.split(".");if(p.length!==3)return null;const b=p[1].replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(atob(b.padEnd(Math.ceil(b.length/4)*4,"=")));}catch{return null;}}
function decodeJwtPart(value:string):Uint8Array{const b=value.replace(/-/g,"+").replace(/_/g,"/");const raw=atob(b.padEnd(Math.ceil(b.length/4)*4,"="));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function verifyMcpActorAssertion(token:string,agentId:string){try{
 const parts=token.split(".");if(parts.length!==3||!SERVICE_KEY)return null;
 const claims=claimsFromJwt(token);if(!claims)return null;
 const now=Math.floor(Date.now()/1000);
 if(claims.aud!=="chatb2k-ecosystem-tool-gateway"||claims.scope!=="chatb2k:gateway:actor"||claims.agent_id!==agentId||Number(claims.exp)<=now||Number(claims.iat)>now+10)return null;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const signature=decodeJwtPart(parts[2]);
  const signatureBuffer=new ArrayBuffer(signature.byteLength);
  new Uint8Array(signatureBuffer).set(signature);
  const valid=await crypto.subtle.verify("HMAC",key,signatureBuffer,new TextEncoder().encode(parts[0]+"."+parts[1]));
 return valid?claims:null;
 }catch{return null;}}
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
 const mcpActor=await verifyMcpActorAssertion(req.headers.get("x-chatb2k-actor")??"",agentId);
 if(!mcpActor)return json({error:"AUTHENTICATED_MCP_ACTOR_ASSERTION_REQUIRED",request_id:rid},403);
 try{
  const agent=await loadAgent(agentId);
  const elevated=["ROOT","GLOBAL_ADMIN"].includes(String(agent?.permission_level));
  if(elevated&&(agentId!=="chatb2k101"||mcpActor.sub===undefined||mcpActor.email!=="ceo@resofit.fit")){
   await audit(role,actor,agentId,action,null,rid,"root_actor_denied",403,started);
   return json({error:"CEO_ROOT_ACTOR_BINDING_REQUIRED",request_id:rid},403);
  }
  if(!agent||agent.enabled!==true||agent.status!=="ENABLED"||agent.kill_switch_enabled===true||agent.health_status==="FAILED"){await audit(role,actor,agentId,action,null,rid,"agent_denied",403,started);return json({error:"AGENT_NOT_AUTHORIZED_OR_DISABLED",request_id:rid},403);}
  const allowed=Array.isArray(agent.allowed_tools)?agent.allowed_tools.map(String):[];
  const list=Object.entries(INTERNAL_READ_TOOLS).filter(([name])=>elevated||allowed.includes(name)).map(([name,v])=>({name,endpoint:v.slug,description:v.description,permission:"read_only"}));
  const ext=Object.entries(EXTERNAL_READ_TOOLS).filter(([name])=>elevated||allowed.includes(name)).map(([name,v])=>({name,category:v.category,permission:"read_only",configured:Boolean(Deno.env.get(v.env))}));
  const rootTools=elevated?Object.entries(ROOT_WRITE_TOOLS).map(([name,v])=>({name,permission:v.permission,description:v.description,configured:name.startsWith("vercel.")?Boolean(Deno.env.get("VERCEL_API_TOKEN")):true})):[];
  if(action==="list_tools"){
   await audit(role,actor,agentId,action,null,rid,"success",200,started,{tool_count:list.length+ext.length});
   return json({ok:true,gateway:"ChatB2K Ecosystem Tool Gateway",version:3,project:"resonance-fitness",agent:{agent_id:agent.agent_id,name:agent.name,permission_level:agent.permission_level},request_id:rid,policy:{service_role_runtime_only:true,per_agent_registry_allowlist:true,root_super_admin_enabled:elevated,read_operations_enabled:true,repository_writes_enabled:elevated,workflow_dispatch_enabled:elevated,verified_edge_function_dispatch_enabled:elevated,batch_orchestration_enabled:elevated,dynamic_page_generation_via_repo_writes:elevated,external_ingest_growth_and_product_enrichment_via_verified_bindings:elevated,vercel_project_management_enabled:Boolean(Deno.env.get("VERCEL_API_TOKEN")),payment_mutations_enabled:false,email_sending_enabled:false},tools:[...list,...ext,...rootTools]});
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
    const path=String(input.path??"");const parts=path.split("/");
    if(parts.length!==8||parts[1]!=="repos"||!parts[2]||!parts[3]||parts[4]!=="actions"||parts[5]!=="workflows"||!parts[6]||parts[7]!=="dispatches")throw new Error("WORKFLOW_DISPATCH_PATH_REQUIRED");
    result=await githubBridge("POST",{method:"POST",path,body:input.body&&typeof input.body==="object"?input.body:{ref:"main"}});
   }else if(tool==="ecosystem.dispatch"){
    const ids=Array.isArray(input.binding_ids)?input.binding_ids.map(String):[];
    const mode=String(input.mode??"plan");if(!["plan","execute"].includes(mode))throw new Error("DISPATCH_MODE_MUST_BE_PLAN_OR_EXECUTE");
    const actionName=String(input.action??"run");const payload=input.payload&&typeof input.payload==="object"&&!Array.isArray(input.payload)?input.payload as Record<string,unknown>:{};
    const key=String(input.idempotency_key??"");if(mode==="execute"&&key.length<8)throw new Error("IDEMPOTENCY_KEY_REQUIRED_FOR_EXECUTION");
    result=await dispatchBindings(ids,mode,actionName,payload,key,agentId);
   }else if(tool==="vercel.project.write"){
    const method=String(input.method??"POST").toUpperCase();const path=String(input.path??"/v10/projects");
    if(!["POST","PATCH"].includes(method))throw new Error("VERCEL_PROJECT_WRITE_METHOD_NOT_ALLOWED");
    result=await callVercelApi(method as "POST"|"PATCH",path,input.body&&typeof input.body==="object"?input.body as Record<string,unknown>:{});
   }else if(tool==="vercel.deployment.create"){
    result=await callVercelApi("POST","/v13/deployments",input.body&&typeof input.body==="object"?input.body as Record<string,unknown>:{});
   }else if(tool==="vercel.deployment.promote"){
    const id=String(input.deployment_id??"");if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error("VERCEL_DEPLOYMENT_ID_REQUIRED");
    result=await callVercelApi("POST","/v13/deployments/"+id+"/promote",input.body&&typeof input.body==="object"?input.body as Record<string,unknown>:{});
   }
  }else{result=await callExternal(tool);if(result===null){await audit(role,actor,agentId,action,tool,rid,"tool_denied",403,started);return json({error:"TOOL_NOT_ALLOWLISTED",tool,request_id:rid},403);}}
  const item=result as Record<string,unknown>;const status=Number(item.status??200);const ok=item.configured===false?false:(item.ok!==false&&status<400);
  await audit(role,actor,agentId,action,tool,rid,ok?"success":"provider_error",status,started);
  return json({ok,request_id:rid,result},ok?200:502);
 }catch(e){const msg=e instanceof Error?e.message:String(e);await audit(role,actor,agentId,action,String(body.tool??"")||null,rid,"error",500,started,{error:msg});return json({error:"TOOL_GATEWAY_FAILED",request_id:rid},500);}
});
