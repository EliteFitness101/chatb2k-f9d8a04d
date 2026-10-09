import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { put } from "npm:@vercel/blob@1.1.1";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GEMINI_KEY=Deno.env.get("GEMINI_API_KEY")||"";
const BLOB_TOKEN=Deno.env.get("BLOB_READ_WRITE_TOKEN")||Deno.env.get("VERCEL_BLOB_READ_WRITE_TOKEN")||"";
const CRON=Deno.env.get("CONTENT_CRON_SECRET")||Deno.env.get("BUFFER_CRON_SECRET")||"";
const MODEL="veo-3.1-generate-preview";
const pillars=["ecosystem_reset","martial","personalize","meal_plans","meal_move","chatb2k_recommended"];
const out=(x:unknown,s=200)=>Response.json(x,{status:s,headers:{"cache-control":"no-store"}});
function auth(r:Request){const h=r.headers.get("x-content-cron-secret")||r.headers.get("x-buffer-cron-secret")||"";return !!CRON&&h===CRON}
async function sha(s:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")} async function shaBytes(b:ArrayBuffer){const h=await crypto.subtle.digest("SHA-256",b);return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function reserve(requestId:string,pillar:string,promptHash:string){const {data,error}=await db.rpc("reserve_flow_generation",{p_request_id:requestId,p_content_pillar:pillar,p_prompt_hash:promptHash});if(error)throw error;return data}
async function complete(requestId:string,status:string,assetId:string|null,url:string|null,duration:number|null,metadata:any={}){const {data,error}=await db.rpc("complete_flow_generation",{p_request_id:requestId,p_status:status,p_asset_id:assetId,p_canonical_url:url,p_duration_seconds:duration,p_metadata:metadata});if(error)throw error;return data}
async function generate(prompt:string){
 if(!GEMINI_KEY)return {ok:false,reason:"GEMINI_API_KEY_missing"};
 const start=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predictLongRunning`,{method:"POST",headers:{"x-goog-api-key":GEMINI_KEY,"Content-Type":"application/json"},body:JSON.stringify({instances:[{prompt}],parameters:{aspectRatio:"9:16",durationSeconds:"8",resolution:"720p",numberOfVideos:1}})});
 if(!start.ok)return {ok:false,reason:`Veo_HTTP_${start.status}`};
 const op=await start.json(); const name=String(op.name||""); if(!name)return {ok:false,reason:"veo_operation_missing"};
 const deadline=Date.now()+8*60*1000;
 let status:any=op;
 while(!status.done && Date.now()<deadline){await new Promise(r=>setTimeout(r,10000));const rr=await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`,{headers:{"x-goog-api-key":GEMINI_KEY}});if(!rr.ok)return {ok:false,reason:`Veo_poll_HTTP_${rr.status}`};status=await rr.json();}
 if(!status.done)return {ok:false,reason:"veo_generation_timeout",operation:name};
 const uri=status?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
 if(!uri)return {ok:false,reason:"veo_video_uri_missing",operation:name};
 const vr=await fetch(uri,{headers:{"x-goog-api-key":GEMINI_KEY}});
 if(!vr.ok)return {ok:false,reason:`Veo_download_HTTP_${vr.status}`,operation:name};
 const blob=await vr.arrayBuffer();
 return {ok:true,operation:name,bytes:blob};
}
async function ingest(requestId:string,pillar:string,prompt:string,blobBytes:ArrayBuffer,operation:string){
 if(!BLOB_TOKEN)return {ok:false,reason:"BLOB_READ_WRITE_TOKEN_missing"};
 const fingerprint=await shaBytes(blobBytes);
 const pathname=`buffer/assets/flow/flow-${requestId}.mp4`;
 const putResult=await put(pathname,new Blob([blobBytes],{type:"video/mp4"}),{access:"public",addRandomSuffix:false,token:BLOB_TOKEN,contentType:"video/mp4"});
 const assetPayload={
  source_provider:"google_flow",
  source_asset_id:requestId,
  source_url:putResult.url,
  canonical_url:putResult.url,
  brand:"ResoFit",
  campaign:"flow_daily_shortform",
  asset_type:"video",
  mime_type:"video/mp4",
  duration_seconds:8,
  aspect_ratio:"9:16",
  audio_present:true,
  rights_status:"generated",
  commercial_status:"generated",
  tiktok_eligible:true,
  youtube_eligible:false,
  google_business_eligible:false,
  countries_allowed:["NG"],
  qa_status:"pending",
  qa_reason:"Flow/Veo generated master persisted to Vercel Blob; awaiting existing ChatB2K media QA and intelligence enrichment",
  content_pillar:pillar,
  fingerprint,
  intelligence:{flow_generation:{source_type:"flow_generated",provider:"google_flow_veo",model:MODEL,operation_id:operation,request_id:requestId,prompt_hash:await sha(prompt),duration_seconds:8,aspect_ratio:"9:16",resolution:"720p",destination_platform:"tiktok",destination_channel_selector:"resonancefitness"}}
 };
 const {data:asset,error}=await db.from("content_asset_registry").upsert(assetPayload,{onConflict:"source_provider,source_asset_id"}).select("id").single();
 if(error||!asset)throw error||new Error("asset_registration_failed");
 const flowIntelligence=assetPayload.intelligence;
 await db.from("content_asset_registry").update({intelligence:{...flowIntelligence,flow_generation:{...flowIntelligence.flow_generation,blob_pathname:pathname,canonical_url:putResult.url}}}).eq("id",asset.id);
 await complete(requestId,"completed",asset.id,putResult.url,8,{blob_pathname:pathname,operation_id:operation,provider:MODEL});
 return {ok:true,asset_id:asset.id,canonical_url:putResult.url,blob_pathname:pathname};
}
Deno.serve(async r=>{
 if(r.method!=="POST")return out({error:"POST required"},405);
 if(!auth(r))return out({error:"Unauthorized"},401);
 let activeRequestId:string|null=null;
 let activeAction="";
 let reservationMade=false;
 try{
  const b:any=await r.json().catch(()=>({})); const action=String(b.action||"status"); activeAction=action; if(action==="generate"&&!BLOB_TOKEN)return out({ok:false,status:"blocked_configuration",reason:"BLOB_READ_WRITE_TOKEN_missing"},503); if(action==="generate"&&!GEMINI_KEY)return out({ok:false,status:"blocked_configuration",reason:"GEMINI_API_KEY_missing"},503);
  if(action==="status"){const {data:g}=await db.from("flow_generation_gate").select("*").eq("gate_key","default").single();const {data:events}=await db.from("flow_generation_events").select("id,request_id,status,content_pillar,duration_seconds,canonical_url,reserved_at,completed_at,failed_at").eq("gate_key","default").order("reserved_at",{ascending:false}).limit(20);return out({ok:true,gate:g,events:events||[]})}
  if(!["reserve","generate","intake","complete"].includes(action))return out({ok:false,error:"unsupported_action"},400);
  const requestId=String(b.request_id||crypto.randomUUID()); activeRequestId=requestId;
  const pillar=String(b.content_pillar||"chatb2k_recommended"); if(!pillars.includes(pillar))return out({ok:false,error:"invalid_content_pillar",allowed:pillars},400);
  const prompt=String(b.prompt||"").trim(); if(prompt.length<20||prompt.length>5000)return out({ok:false,error:"prompt_length_invalid"},400);
  const promptHash=await sha(prompt); const reservation=await reserve(requestId,pillar,promptHash); if(!reservation?.ok)return out(reservation,429); reservationMade=true;
  if(action==="reserve")return out({ok:true,reservation,request_id:requestId});
  if(action==="generate"){
   if(!GEMINI_KEY){await complete(requestId,"failed",null,null,null,{reason:"GEMINI_API_KEY_missing"});return out({ok:false,request_id:requestId,reason:"GEMINI_API_KEY_missing"},503);}
   if(!BLOB_TOKEN){await complete(requestId,"failed",null,null,null,{reason:"BLOB_READ_WRITE_TOKEN_missing"});return out({ok:false,request_id:requestId,reason:"BLOB_READ_WRITE_TOKEN_missing"},503);}
   const g=await generate(prompt); if(!g.ok){await complete(requestId,"failed",null,null,null,g);return out({ok:false,request_id:requestId,...g},502);}
   const result=await ingest(requestId,pillar,prompt,g.bytes,g.operation); return out({ok:true,request_id:requestId,pillar,model:MODEL,generated:true,...result});
  }
  if(action==="intake"){
   const url=String(b.canonical_url||"").trim(); if(!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/buffer\/assets\//i.test(url))return out({ok:false,error:"approved_public_blob_url_required"},400);
   const assetPayload={source_provider:"google_flow",source_asset_id:requestId,source_url:url,canonical_url:url,brand:"ResoFit",campaign:"flow_daily_shortform",asset_type:"video",mime_type:"video/mp4",duration_seconds:Number(b.duration_seconds||8),aspect_ratio:"9:16",rights_status:"generated",commercial_status:"generated",tiktok_eligible:true,youtube_eligible:false,google_business_eligible:false,countries_allowed:["NG"],qa_status:"pending",qa_reason:"Flow generated asset ingested into existing ChatB2K enrichment flow",content_pillar:pillar,fingerprint:String(b.fingerprint||await sha(url)),intelligence:{flow_generation:{source_type:"flow_generated",provider:"google_flow_veo",request_id:requestId,destination_platform:"tiktok",destination_channel_selector:"resonancefitness"}}};
   const {data:asset,error}=await db.from("content_asset_registry").upsert(assetPayload,{onConflict:"source_provider,source_asset_id"}).select("id,canonical_url").single();if(error||!asset)throw error||new Error("asset_registration_failed");
   await complete(requestId,"completed",asset.id,asset.canonical_url,assetPayload.duration_seconds,{intake:true}); const ir=await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/content-intelligence-enricher`,{method:"POST",headers:{"Content-Type":"application/json","x-content-cron-secret":CRON},body:JSON.stringify({limit:1,campaign:"flow_daily_shortform"})}); const intelligence=await ir.json().catch(()=>({})); return out({ok:true,asset_id:asset.id,canonical_url:asset.canonical_url,next:"content-intelligence-enricher",intelligence});
  }
  if(action==="complete"){return out(await complete(requestId,String(b.status||"failed"),b.asset_id||null,b.canonical_url||null,b.duration_seconds??null,b.metadata||{}))}
  return out({ok:false,error:"unsupported_action"},400);
 }catch(e){
  const safeError=e instanceof Error?e.message:String(e);
  if(reservationMade&&activeRequestId&&(activeAction==="generate"||activeAction==="intake")){
   try{await complete(activeRequestId,"failed",null,null,null,{stage:activeAction,error:safeError.slice(0,240),recovered_by:"flow-generation-gate-catch"});}catch(_terminalError){}
  }
  return out({ok:false,request_id:activeRequestId,error:safeError},500)
 }
});