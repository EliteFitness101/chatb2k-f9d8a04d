import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CRON_SECRET=Deno.env.get("BUFFER_CRON_SECRET")||""; const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function cronSecret(){if(CRON_SECRET)return CRON_SECRET;const {data,error}=await supabase.rpc("get_buffer_cron_secret");if(error||!data)throw Error("BUFFER_CRON_SECRET unavailable");return String(data);}
async function activeDistributionRoute(){
 const {data,error}=await supabase.from("chatb2k_provider_routes").select("route_id,provider,status,config").eq("service_type","social_distribution").eq("provider","Buffer").eq("status","active").maybeSingle();
 if(error) throw error;
 if(!data||String(data.provider||"").toLowerCase()!=="buffer"||data.config?.enabled!==true||data.config?.approved!==true) throw Error("No CEO-approved active social distribution route");
 return data;
}
async function sameSecret(a:string,b:string){const e=new TextEncoder();const[x,y]=await Promise.all([crypto.subtle.digest("SHA-256",e.encode(a)),crypto.subtle.digest("SHA-256",e.encode(b))]);const aa=new Uint8Array(x),bb=new Uint8Array(y);let d=aa.length^bb.length;for(let i=0;i<aa.length;i++)d|=aa[i]^bb[i];return d===0}
async function authorized(req:Request){const c=req.headers.get("x-buffer-cron-secret")??"";if(c){try{const expected=await cronSecret();if(expected&&await sameSecret(c,expected))return true}catch{}}const a=req.headers.get("authorization")??"";const b=a.startsWith("Bearer ")?a.slice(7):"";return Boolean(SERVICE_ROLE&&b&&await sameSecret(b,SERVICE_ROLE))}
async function bufferKey(){const {data,error}=await supabase.rpc("get_buffer_access_token");if(error||!data)throw Error("BUFFER_ACCESS_TOKEN unavailable");return String(data)}
async function gql(query:string,variables:Record<string,unknown>){const token=await bufferKey();const r=await fetch("https://api.buffer.com",{method:"POST",headers:{"content-type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({query,variables})});const t=await r.text();let j:any;try{j=JSON.parse(t)}catch{throw Error(`Buffer non-JSON HTTP ${r.status}`)}if(!r.ok||j.errors?.length)throw Error(JSON.stringify(j.errors??j));return j.data}
async function discoverChannels(){
 const route=await activeDistributionRoute();
 const {data:settings,error:se}=await supabase.from("content_automation_settings").select("organization_id").eq("id",true).single();
 if(se) throw se;
 const organizationId=String(route.config?.organization_id||settings?.organization_id||"").trim();
 if(!organizationId) throw Error("Approved provider route has no configured organization_id");
 const a=await gql(`query{account{organizations{id name}}}`,{});
 const orgs=Array.isArray(a?.account?.organizations)?a.account.organizations:[];
 if(!orgs.some((o:any)=>String(o?.id)===organizationId)) throw Error("Configured organization is not accessible to the connected provider token");
 const c=await gql(`query($organizationId:OrganizationId!){channels(input:{organizationId:$organizationId}){id name displayName service isQueuePaused isDisconnected isLocked}}`,{organizationId});
 return {organizationId,channels:Array.isArray(c?.channels)?c.channels:[]};
}
async function resolveChannel(platform:string,item:any){
 const {organizationId,channels}=await discoverChannels();
 const registryPlatform=platform==="tiktok_recruit"?"tiktok":platform;
 const services:Record<string,string>={tiktok:"tiktok",youtube:"youtube",google_business:"googlebusiness",linkedin:"linkedin",pinterest:"pinterest"};
 const service=services[registryPlatform];
 if(!service)return {organizationId,channel:null,reason:"no_provider_adapter_for_platform"};
 const {data:rows,error}=await supabase.from("buffer_channels").select("channel_id,platform,name,active,verified_at,organization_id").eq("organization_id",organizationId).eq("platform",registryPlatform).eq("active",true).not("verified_at","is",null);
 if(error) throw error;
 const registry=Array.isArray(rows)?rows:[];
 const candidates=channels.filter((c:any)=>String(c.service).toLowerCase()===service&&!c.isDisconnected&&!c.isLocked&&!c.isQueuePaused&&registry.some((r:any)=>String(r.channel_id)===String(c.id)));
 const requestedId=String(item?.metadata?.buffer_channel_id||item?.metadata?.destination_channel_id||item?.metadata?.channel_id||"").trim();
 let selected:any[]=[];
 if(requestedId) selected=candidates.filter((c:any)=>String(c.id)===requestedId);
 else if(platform==="tiktok_recruit"){
  const selector=String(item?.metadata?.channel_selector||"").trim().toLowerCase();
  if(selector) selected=candidates.filter((c:any)=>{const r=registry.find((x:any)=>String(x.channel_id)===String(c.id));return String(r?.name||c.name||c.displayName||"").toLowerCase().includes(selector)});
  else if(candidates.length===1) selected=candidates;
 } else if(candidates.length===1) selected=candidates;
 if(selected.length!==1)return {organizationId,channel:null,reason:selected.length>1?"destination_registry_ambiguous":"no_unique_verified_destination_registry_match"};
 return {organizationId,channel:selected[0],reason:"active_verified_destination_registry"};
}
const BLOB_HOST_SUFFIX=".public.blob.vercel-storage.com";
const isPublicMedia=(u:string)=>{try{const x=new URL(u);const blob=x.hostname.endsWith(BLOB_HOST_SUFFIX)&&x.hostname.length>BLOB_HOST_SUFFIX.length&&x.pathname.length>1;const dropbox=(x.hostname==="www.dropbox.com"||x.hostname==="dl.dropboxusercontent.com")&&/^\/scl\/fi\/[A-Za-z0-9_-]+\/[^/]+$/.test(x.pathname)&&/^[A-Za-z0-9_-]+$/.test(x.searchParams.get("rlkey")||"")&&x.searchParams.get("dl")==="1";const supabaseMedia=x.hostname==="vbqjvmnhdtdhmeeudqnn.supabase.co"&&x.pathname.startsWith("/storage/v1/object/public/resofit-social-media/")&&/\.(mp4|mov)$/.test(x.pathname.toLowerCase());return x.protocol==="https:"&&(blob||dropbox||supabaseMedia)}catch{return false}};
const isVideo=(u:string)=>/^https?:\/\//i.test(u)&&/(?:\.mp4(?:$|[?#])|\.mov(?:$|[?#])|\/video\/)/i.test(u);
const isImage=(u:string)=>/^https?:\/\//i.test(u)&&/(?:\.jpg(?:$|[?#])|\.jpeg(?:$|[?#])|\.png(?:$|[?#])|\.webp(?:$|[?#])|\.heic(?:$|[?#]))/i.test(u);
function platformQa(item:any,platform:string){const qaPlatform=platform==="tiktok_recruit"?"tiktok":platform; const q=item?.metadata?.platform_qa?.[qaPlatform];if(q&&q.status&&q.status!=="pass")return {ok:false,reason:String(q.reason||"platform QA not passed")};return {ok:true};}
Deno.serve(async req=>{if(req.method!=="POST")return Response.json({error:"POST required"},{status:405});if(!(await authorized(req)))return Response.json({error:"Unauthorized"},{status:401});const b=await req.json().catch(()=>({}));if(b?.diagnostic===true){try{const d=await discoverChannels();const channels=await Promise.all((d.channels||[]).filter((c:any)=>!c.isDisconnected&&!c.isLocked).map(async(c:any)=>({id:c.id,name:c.name,displayName:c.displayName,service:c.service,isQueuePaused:c.isQueuePaused,daily:null})));return Response.json({ok:true,organization_id:d.organizationId,channels,source:"buffer-live-discovery"});}catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:502})}}try{const {data:item,error}=await supabase.from("content_queue").select("*").eq("id",b.id).eq("status","approved").single();if(error)throw error;if(!item)return Response.json({ok:true,message:"Queue item not approved"});const platform=String(item.platform||item.platforms?.[0]||"").trim();if(!platform)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"platform_missing"});const {data:settings,error:settingsError}=await supabase.from("content_automation_settings").select("paused,scheduler_enabled").eq("id",true).single();if(settingsError)throw settingsError;if(settings?.paused||settings?.scheduler_enabled===false)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:settings?.paused?"automation_paused":"scheduler_disabled"});const {data:globalRateLimit,error:globalRateLimitError}=await supabase.from("content_publish_log").select("created_at,error_message,platform,channel_id").eq("provider","buffer").eq("status","rate_limited").ilike("error_message","%RATE_LIMIT_EXCEEDED%").order("created_at",{ascending:false}).limit(1).maybeSingle();if(globalRateLimitError)throw globalRateLimitError;if(globalRateLimit?.created_at){const parsedWindow=(()=>{try{const parsed=JSON.parse(String(globalRateLimit.error_message||""));const entries=Array.isArray(parsed)?parsed:[parsed];const windowValue=entries.map((entry:any)=>entry?.extensions?.window).find((value:any)=>typeof value==="string");const match=String(windowValue||"").match(/^(\d+)(s|m|h|d)$/i);if(!match)return 24*60*60*1000;const factor=({s:1000,m:60000,h:3600000,d:86400000} as Record<string,number>)[match[2].toLowerCase()];return Number(match[1])*factor;}catch{return 24*60*60*1000;}})();const globalLockAge=Date.now()-new Date(globalRateLimit.created_at).getTime();if(globalLockAge<parsedWindow)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"buffer_global_rate_limit_backoff",provider_window_ms:parsedWindow,retry_after_seconds:Math.ceil((parsedWindow-globalLockAge)/1000)});}const resolved=await resolveChannel(platform,item);const channel=resolved.channel?.id?.trim();if(!channel)return Response.json({ok:true,queue_id:item.id,platform,message:"No eligible Buffer channel",reason:resolved.reason});if(resolved.channel?.isQueuePaused)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"buffer_queue_paused"});const qa=platformQa(item,platform);if(!qa.ok)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:qa.reason});const isBigoHighlight=String(item.campaign_key||"")==="live_stream_highlights"||String(item.metadata?.source_type||"").toLowerCase()==="bigo_live"||String(item.metadata?.campaign||"")==="live_stream_highlights";
if(isBigoHighlight){
 if(item.metadata?.bigo_verified_host_id!==true) return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"host_not_in_verified_host_allowlist"});
 if(item.metadata?.rights_verified!==true||item.metadata?.originality_verified!==true) return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"rights_or_originality_not_verified"});
 const assetId=String(item.metadata?.content_asset_id||"").trim();
 if(!assetId) return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"content_asset_registry_reference_missing"});
 const {data:asset,error:assetError}=await supabase.from("content_asset_registry").select("rights_status,commercial_status,qa_status,origin_review_status,rights_evidence,publish_blockers").eq("id",assetId).maybeSingle();
 if(assetError) throw assetError;
 if(!asset||asset.rights_status!=="verified"||asset.commercial_status!=="authorized"||asset.qa_status!=="approved"||asset.origin_review_status!=="approved"||!asset.rights_evidence||Object.keys(asset.rights_evidence).length===0||(Array.isArray(asset.publish_blockers)&&asset.publish_blockers.length>0)) return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"content_asset_registry_rights_origin_or_qa_not_approved"});
}const {data:channelConfig,error:channelConfigError}=await supabase.from("buffer_channels").select("daily_limit,active").eq("channel_id",channel).maybeSingle();if(channelConfigError)throw channelConfigError;if(channelConfig?.active===false)return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"channel_disabled"});const startOfDay=new Date();startOfDay.setHours(0,0,0,0);const {count:dailyCount,error:dailyCountError}=await supabase.from("content_publish_log").select("id",{count:"exact",head:true}).eq("provider","buffer").eq("platform",platform).eq("channel_id",channel).gte("created_at",startOfDay.toISOString());if(dailyCountError)throw dailyCountError;if(channelConfig?.daily_limit!=null&&Number(dailyCount||0)>=Number(channelConfig.daily_limit))return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"daily_limit_reached",daily_count:Number(dailyCount||0),daily_limit:Number(channelConfig.daily_limit)});
const {data:lastRateLimit}=await supabase.from("content_publish_log").select("created_at").eq("provider","buffer").eq("platform",platform).eq("channel_id",channel).eq("status","rate_limited").ilike("error_message","%RATE_LIMIT_EXCEEDED%").order("created_at",{ascending:false}).limit(1).maybeSingle();
if(lastRateLimit?.created_at){
 const lockAge=Date.now()-new Date(lastRateLimit.created_at).getTime();
 if(lockAge<24*60*60*1000)return Response.json({
   ok:true,queue_id:item.id,platform,status:"held",reason:"buffer_rate_limit_backoff",
   retry_after_seconds:Math.ceil((24*60*60*1000-lockAge)/1000)
 });
}
const text=String(item.caption??item.title??"").trim();if(!text)throw Error("Queue item has no caption/title");const u=String(item.asset_url??"").trim().replace(/^https:\/\/www\.dropbox\.com\//i,"https://dl.dropboxusercontent.com/");if(!isPublicMedia(u))throw Error("Public allowlisted media URL required (Vercel Blob or Dropbox shared link)");const input:any={channelId:channel,text,schedulingType:"automatic",mode:"addToQueue",source:"resofit-content-engine",aiAssisted:true};if(platform==="google_business"){input.metadata={google:{type:"whats_new",detailsWhatsNew:{button:"learn_more",link:String(item.destination||"https://www.resofit.fit")}}};if(isVideo(u))input.assets=[{video:{url:u}}];else if(isImage(u))input.assets=[{image:{url:u}}];}else if(isVideo(u)){input.assets=[{video:{url:u}}];input.metadata=platform==="youtube"?{youtube:{title:String(item.title??text).trim(),categoryId:"17",privacy:"public",notifySubscribers:true,embeddable:true,isAiGenerated:true}}:{tiktok:{isAiGenerated:true}};}else if(platform==="tiktok_recruit"&&isImage(u))return Response.json({ok:true,queue_id:item.id,platform,status:"held",reason:"tiktok_video_required"});else throw Error(platform==="youtube"?"Queue item needs a public video URL":"Queue item needs public video or image media");const m=`mutation CreatePost($input: CreatePostInput!){createPost(input:$input){... on PostActionSuccess{post{id dueAt status channelId}} ... on MutationError{message}}}`;const r=await gql(m,{input}),p=r?.createPost?.post;if(!p?.id)throw Error(typeof r?.createPost?.message==="string"?r.createPost.message:JSON.stringify(r?.createPost||r));const{data:up,error:ue}=await supabase.from("content_queue").update({status:"scheduled",buffer_post_ids:{[platform]:p.id},error_message:null}).eq("id",item.id).eq("status","approved").select("id,status,buffer_post_ids").single();if(ue)throw ue;await supabase.from("content_publish_log").insert({queue_id:item.id,platform,channel_id:channel,provider:"buffer",provider_post_id:p.id,status:"scheduled"});
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
   const logChannel = b?.channel_id || null;
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