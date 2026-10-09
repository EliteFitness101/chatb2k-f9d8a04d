import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CRON_SECRET=Deno.env.get("BUFFER_CRON_SECRET")||""; const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function cronSecret(){if(CRON_SECRET)return CRON_SECRET;const {data,error}=await supabase.rpc("get_buffer_cron_secret");if(error||!data)throw Error("BUFFER_CRON_SECRET unavailable");return String(data);}
const LOCKED_BUFFER_ORG="6a7cfd9705e59fe6e2a3bf71";
const LOCKED_CHANNELS={tiktok:"6ab33e0aea19ca0bdebf46ff",youtube:"6a7d4ae7b2d9d577436a9c08",tiktok_recruit:"6a7cfe5ab2d9d57743686cc5"} as Record<string,string>;
async function sameSecret(a:string,b:string){const e=new TextEncoder();const[x,y]=await Promise.all([crypto.subtle.digest("SHA-256",e.encode(a)),crypto.subtle.digest("SHA-256",e.encode(b))]);const aa=new Uint8Array(x),bb=new Uint8Array(y);let d=aa.length^bb.length;for(let i=0;i<aa.length;i++)d|=aa[i]^bb[i];return d===0}
async function authorized(req:Request){const c=req.headers.get("x-buffer-cron-secret")??"";if(c){try{const expected=await cronSecret();if(expected&&await sameSecret(c,expected))return true}catch{}}const a=req.headers.get("authorization")??"";const b=a.startsWith("Bearer ")?a.slice(7):"";return Boolean(SERVICE_ROLE&&b&&await sameSecret(b,SERVICE_ROLE))}
async function bufferKey(){const {data,error}=await supabase.rpc("get_buffer_access_token");if(error||!data)throw Error("BUFFER_ACCESS_TOKEN unavailable");return String(data)}
async function gql(query:string,variables:Record<string,unknown>){const token=await bufferKey();const r=await fetch("https://api.buffer.com",{method:"POST",headers:{"content-type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({query,variables})});const t=await r.text();let j:any;try{j=JSON.parse(t)}catch{throw Error(`Buffer non-JSON HTTP ${r.status}`)}if(!r.ok||j.errors?.length)throw Error(JSON.stringify(j.errors??j));return j.data}
async function discoverChannels(){const q=`query{account{organizations{id name}}}`;const a=await gql(q,{});const orgs=Array.isArray(a?.account?.organizations)?a.account.organizations:[];if(!orgs.some((o:any)=>String(o?.id)===LOCKED_BUFFER_ORG))throw Error("Buffer organization mismatch: locked ResoFit organization not owned by Vault token");const c=await gql(`query($organizationId:OrganizationId!){channels(input:{organizationId:$organizationId}){id name displayName service isQueuePaused isDisconnected isLocked}}`,{organizationId:LOCKED_BUFFER_ORG});return {organizationId:LOCKED_BUFFER_ORG,channels:Array.isArray(c?.channels)?c.channels:[]}}
async function resolveChannel(platform:string,item:any){const {organizationId,channels}=await discoverChannels();const service=platform==="youtube"?"youtube":platform==="google_business"?"googlebusiness":"tiktok";let candidates=channels.filter((c:any)=>String(c.service).toLowerCase()===service&&!c.isDisconnected&&!c.isLocked);if(platform==="tiktok"||platform==="youtube"||platform==="tiktok_recruit"){const targetId=LOCKED_CHANNELS[platform];const target=candidates.filter((c:any)=>c.id===targetId);return {organizationId,channel:target.length===1?target[0]:null,reason:target.length===1?"locked_channel_verified_live":"locked_channel_not_found_or_unavailable"};}if(platform==="google_business")return {organizationId,channel:null,reason:"google_business_not_enabled_until_live_channel_verified"};const flowLock=String(item?.metadata?.destination_lock||"");if(flowLock==="tiktok:resonancefitness"&&service==="tiktok"){const target=candidates.filter((c:any)=>`${c.name||""} ${c.displayName||""}`.toLowerCase().replace(/[^a-z0-9]/g,"").includes("resonancefitness"));if(target.length!==1)return {organizationId,channel:null,reason:target.length===0?"flow_resonancefitness_channel_not_found":"flow_resonancefitness_channel_ambiguous"};candidates=target;}if(!candidates.length)return {organizationId,channel:null,reason:"no_connected_channel"};if(platform==="tiktok_recruit"){const hint=String(item?.metadata?.channel_selector||"recruitment").toLowerCase();const preferred=candidates.filter((c:any)=>`${c.name||""} ${c.displayName||""}`.toLowerCase().replace(/[^a-z0-9]/g,"").includes("resoflex2"));if(preferred.length===1)return {organizationId,channel:preferred[0],reason:"recruitment_channel_preferred"};const scored=candidates.map((c:any)=>{const label=`${c.name||""} ${c.displayName||""}`.toLowerCase();let score=0;for(const k of hint.split(/[^a-z0-9]+/).filter(Boolean))if(label.includes(k))score+=3;for(const k of ["recruit","resonance","elite","bigo"])if(label.includes(k))score+=1;if(c.isQueuePaused)score-=5;return {c,score}}).sort((a:any,b:any)=>b.score-a.score);return {organizationId,channel:scored[0]?.c||null,reason:"dynamic_channel_discovery"}}return {organizationId,channel:candidates.find((c:any)=>!c.isQueuePaused)||candidates[0],reason:"dynamic_channel_discovery"}}
const BLOB_HOST_SUFFIX=".public.blob.vercel-storage.com";
const isPublicMedia=(u:string)=>{try{const x=new URL(u);return x.protocol==="https:"&&x.hostname.endsWith(BLOB_HOST_SUFFIX)&&x.hostname.length>BLOB_HOST_SUFFIX.length&&x.pathname.length>1}catch{return false}};
const isVideo=(u:string)=>/^https?:\/\//i.test(u)&&/(?:\.mp4(?:$|[?#])|\.mov(?:$|[?#])|\/video\/)/i.test(u);
const isImage=(u:string)=>/^https?:\/\//i.test(u)&&/(?:\.jpg(?:$|[?#])|\.jpeg(?:$|[?#])|\.png(?:$|[?#])|\.webp(?:$|[?#])|\.heic(?:$|[?#]))/i.test(u);
function platformQa(item:any,platform:string){const qaPlatform=platform==="tiktok_recruit"?"tiktok":platform; const q=item?.metadata?.platform_qa?.[qaPlatform];if(q&&q.status&&q.status!=="pass")return {ok:false,reason:String(q.reason||"platform QA not passed")};return {ok:true};}
Deno.serve(async req=>{if(req.method!=="POST")return Response.json({error:"POST required"},{status:405});if(!(await authorized(req)))return Response.json({error:"Unauthorized"},{status:401});const b=await req.json().catch(()=>({}));if(b?.diagnostic===true){try{const d=await discoverChannels();const channels=await Promise.all((d.channels||[]).filter((c:any)=>!c.isDisconnected&&!c.isLocked).map(async(c:any)=>({id:c.id,name:c.name,displayName:c.displayName,service:c.service,isQueuePaused:c.isQueuePaused,daily:null})));return Response.json({ok:true,organization_id:d.organizationId,channels,source:"buffer-live-discovery"});}catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:502})}}try{const {data:item,error}=await supabase.from("content_queue").select("*").eq("id",b.id).eq("status","approved").single();if(error)throw error;if(!item)return Response.json({ok:true,message:"Queue item not approved"});const platform=String(item.platform||item.platforms?.[0]||"").trim();if(platform!=="tiktok"&&platform!=="youtube"&&platform!=="tiktok_recruit"&&platform!=="google_business")return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"platform_disabled_production"});const {data:settings,error:settingsError}=await supabase.from("content_automation_settings").select("paused,scheduler_enabled").eq("id",true).single();if(settingsError)throw settingsError;if(settings?.paused||settings?.scheduler_enabled===false)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:settings?.paused?"automation_paused":"scheduler_disabled"});const {data:globalRateLimit,error:globalRateLimitError}=await supabase.from("content_publish_log").select("created_at,error_message,platform,channel_id").eq("provider","buffer").eq("status","rate_limited").ilike("error_message","%RATE_LIMIT_EXCEEDED%").order("created_at",{ascending:false}).limit(1).maybeSingle();if(globalRateLimitError)throw globalRateLimitError;if(globalRateLimit?.created_at){const globalLockAge=Date.now()-new Date(globalRateLimit.created_at).getTime();if(globalLockAge<24*60*60*1000)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"buffer_global_rate_limit_backoff",retry_after_seconds:Math.ceil((24*60*60*1000-globalLockAge)/1000)});}const resolved=await resolveChannel(platform,item);const channel=resolved.channel?.id?.trim();if(!channel)return Response.json({ok:true,queue_id:item.id,platform,message:"No eligible Buffer channel",reason:resolved.reason});if(resolved.channel?.isQueuePaused)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"buffer_queue_paused"});const qa=platformQa(item,platform);if(!qa.ok)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:qa.reason});const {data:channelConfig,error:channelConfigError}=await supabase.from("buffer_channels").select("daily_limit,active").eq("channel_id",channel).maybeSingle();if(channelConfigError)throw channelConfigError;if(channelConfig?.active===false)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"channel_disabled"});const startOfDay=new Date();startOfDay.setHours(0,0,0,0);const {count:dailyCount,error:dailyCountError}=await supabase.from("content_publish_log").select("id",{count:"exact",head:true}).eq("provider","buffer").eq("platform",platform).eq("channel_id",channel).gte("created_at",startOfDay.toISOString());if(dailyCountError)throw dailyCountError;if(channelConfig?.daily_limit!=null&&Number(dailyCount||0)>=Number(channelConfig.daily_limit))return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"daily_limit_reached",daily_count:Number(dailyCount||0),daily_limit:Number(channelConfig.daily_limit)});
const {data:lastRateLimit}=await supabase.from("content_publish_log").select("created_at").eq("provider","buffer").eq("platform",platform).eq("channel_id",channel).eq("status","rate_limited").ilike("error_message","%RATE_LIMIT_EXCEEDED%").order("created_at",{ascending:false}).limit(1).maybeSingle();
if(lastRateLimit?.created_at){
 const lockAge=Date.now()-new Date(lastRateLimit.created_at).getTime();
 if(lockAge<24*60*60*1000)return Response.json({
   ok:true,queue_id:item.id,platform,status:"held",reason:"buffer_rate_limit_backoff",
   retry_after_seconds:Math.ceil((24*60*60*1000-lockAge)/1000)
 });
}
const text=String(item.caption??item.title??"").trim();if(!text)throw Error("Queue item has no caption/title");const u=String(item.asset_url??"").trim();if(!isPublicMedia(u))throw Error("Public Vercel Blob media required");const input:any={channelId:channel,text,schedulingType:"automatic",mode:"addToQueue",source:"resofit-content-engine",aiAssisted:true};if(platform==="google_business"){input.metadata={google:{type:"whats_new",detailsWhatsNew:{button:"learn_more",link:String(item.destination||"https://www.resofit.fit")}}};}else if(isVideo(u)){input.assets=[{video:{url:u}}];input.metadata=platform==="youtube"?{youtube:{title:String(item.title??text).trim(),categoryId:"17",privacy:"public",notifySubscribers:true,embeddable:true,isAiGenerated:true}}:{tiktok:{isAiGenerated:true}};}else if(platform==="tiktok_recruit"&&isImage(u)){input.assets=[{image:{url:u}}];}else throw Error(platform==="youtube"?"Queue item needs a public video URL":"Queue item needs public video or image media");const m=`mutation CreatePost($input: CreatePostInput!){createPost(input:$input){... on PostActionSuccess{post{id dueAt status channelId}} ... on MutationError{message}}}`;const r=await gql(m,{input}),p=r?.createPost?.post;if(!p?.id)throw Error(typeof r?.createPost?.message==="string"?r.createPost.message:JSON.stringify(r?.createPost||r));const{data:up,error:ue}=await supabase.from("content_queue").update({status:"scheduled",buffer_post_ids:{[platform]:p.id},error_message:null}).eq("id",item.id).eq("status","approved").select("id,status,buffer_post_ids").single();if(ue)throw ue;await supabase.from("content_publish_log").insert({queue_id:item.id,platform,channel_id:channel,provider:"buffer",provider_post_id:p.id,status:"scheduled"});
// Additive revenue-campaign fan-out: once Buffer accepts the campaign, create idempotent Telegram child jobs and immediately hand them to the existing social publisher.
let telegramFanout:any[]=[];let telegramFanoutErrors:any[]=[];
if(item?.metadata?.fanout_to_telegram===true){
  const{data:tds,error:te}=await supabase.from("social_destinations").select("id,provider,platform,external_channel_id,active").eq("provider","telegram").eq("active",true);
  if(te) throw te;
  for(const d of (tds||[])){
    const idem=`fanout:${item.id}:${d.id}`;
    const{data:existing}=await supabase.from("social_publish_attempts").select("id,queue_id,status").eq("idempotency_key",idem).maybeSingle();
    let childId=existing?.queue_id;
    if(!childId){
      const{data:child,error:ce}=await supabase.from("content_queue").insert({
        sku:item.sku,title:item.title,asset_url:item.asset_url,public_id:item.public_id,caption:item.caption,
        platform:d.platform||"telegram",destination:d.external_channel_id,status:"approved",scheduled_at:item.scheduled_at,
        metadata:{...(item.metadata||{}),source_queue_id:item.id,social_destination_id:d.id,distribution_fanout:true,source_platform:platform}
      }).select("id").single();
      if(ce){telegramFanoutErrors.push({destination_id:d.id,error:String(ce.message||ce)});continue;}
      childId=child.id;
      const{error:ae}=await supabase.from("social_publish_attempts").insert({
        queue_id:childId,provider:"telegram",platform:d.platform||"telegram",destination_id:d.id,
        idempotency_key:idem,status:"queued",attempt_count:0,response_metadata:{source_queue_id:item.id,buffer_post_id:p.id}
      });
      if(ae){telegramFanoutErrors.push({destination_id:d.id,error:String(ae.message||ae)});continue;}
    }
    try{
      const secret=await cronSecret();
      const sr=await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/social-publisher`,{
        method:"POST",headers:{"content-type":"application/json","x-social-cron-secret":secret},
        body:JSON.stringify({id:childId})
      });
      const sj=await sr.json().catch(()=>({}));
      telegramFanout.push({destination_id:d.id,queue_id:childId,status:sj?.status||"queued",message_id:sj?.message_id||null});
    }catch(e){telegramFanoutErrors.push({destination_id:d.id,queue_id:childId,error:e instanceof Error?e.message:String(e)});}
  }
}
return Response.json({ok:true,queue_id:item.id,platform,buffer_post_id:p.id,status:up?.status,dueAt:p.dueAt,telegramFanout,telegramFanoutErrors})}catch(e){
 const message=e instanceof Error?e.message:String(e);
 const id=b?.id;
 let transient=false;
 if(id){
   const {data:qrow}=await supabase.from("content_queue").select("platform").eq("id",id).maybeSingle();
   const errorText=message.toLowerCase();
   transient =
     errorText.includes("rate_limit") ||
     errorText.includes("rate limit") ||
     errorText.includes("scheduled posts limit") ||
     errorText.includes("too many requests") ||
     errorText.includes("throttl") ||
     errorText.includes("http 429") ||
     errorText.includes("http 500") ||
     errorText.includes("http 502") ||
     errorText.includes("http 503") ||
     errorText.includes("timeout") ||
     errorText.includes("temporarily");
   const logPlatform=String(qrow?.platform||b?.platform||"unknown");
   const logChannel =
     b?.channel_id ||
     (logPlatform==="tiktok_recruit"?"6a7cfe5ab2d9d57743686cc5":
      logPlatform==="tiktok"?"6ab33e0aea19ca0bdebf46ff":
      logPlatform==="youtube"?"6a7d4ae7b2d9d577436a9c08":null);
   await supabase.from("content_publish_log").insert({
     queue_id:id,platform:logPlatform,channel_id:logChannel,provider:"buffer",
     status:transient?"rate_limited":"failed",error_message:message
   });
   if(!transient){
     await supabase.from("content_queue").update({status:"failed",error_message:message}).eq("id",id).eq("status","approved");
   }
 }
 console.error(e);
 return Response.json({ok:false,error:message,status:transient?"held":"failed"},{status:transient?429:500});
}})