import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { allowedBlobCover } from "./cover-source.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "resofit-social-media";
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/bigo-highlights/`;
const db = createClient(SUPABASE_URL, SERVICE_ROLE);
const out = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
function same(a: string, b: string) { if (!a || !b || a.length !== b.length) return false; let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; }
async function expectedSecret() { const env=Deno.env.get("BUFFER_CRON_SECRET")||""; if(env)return env; const {data,error}=await db.rpc("get_buffer_cron_secret"); if(error||!data)throw new Error("Buffer cron secret unavailable"); return String(data); }
function allowedDropbox(url: string) { try { const u=new URL(url); return u.protocol==="https:"&&(u.hostname==="www.dropbox.com"||u.hostname==="dl.dropboxusercontent.com")&&/^\/scl\/fi\/[A-Za-z0-9_-]+\/[^/]+$/.test(u.pathname)&&Boolean(u.searchParams.get("rlkey"))&&u.searchParams.get("dl")==="1"; } catch { return false; } }
function allowedBlob(url: string) { try { const u=new URL(url); return u.protocol==="https:"&&u.hostname==="ab2ttlkn9no0tuoa.public.blob.vercel-storage.com"&&(/^\/buffer\/assets\/bigo_highlights\//.test(u.pathname)||/^\/bigo_highlights\//.test(u.pathname))&&/\.(mp4|mov)$/i.test(u.pathname); } catch { return false; } }
function allowedR2Media(url:string,kind:"video"|"image"){try{const u=new URL(url);if(u.protocol!=="https:"||u.hostname!=="media.resofit.fit"||u.username||u.password)return false;const p=u.pathname;if(!(p.startsWith("/public/bigo/")||p.startsWith("/chatb2k/bigo-highlights/")))return false;return kind==="video"?/\.(mp4|mov)$/i.test(p):/\.(jpg|jpeg|png|webp)$/i.test(p);}catch{return false;}}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return out({error:"POST required"},405);
 let expected=""; try{expected=await expectedSecret()}catch{return out({error:"Auth configuration unavailable"},503)}
 if(!same(req.headers.get("x-buffer-cron-secret")||"",expected))return out({error:"Unauthorized"},401);
 let activeQueueId="";
 try{
  const body=await req.json().catch(()=>({})); const queueId=String(body?.queue_id||"").trim(); activeQueueId=queueId;
  if(!/^[0-9a-f-]{36}$/i.test(queueId))return out({error:"Valid queue_id required"},400);
  const {data:item,error:itemError}=await db.from("content_queue").select("id,status,platform,asset_url,metadata,title").eq("id",queueId).maybeSingle();
  if(itemError)throw itemError; if(!item)return out({error:"Queue item not found"},404);
  if(!["tiktok","tiktok_recruit","instagram"].includes(String(item.platform))||!["approved","failed","scheduled"].includes(String(item.status)))return out({error:"Only approved/failed TikTok items may be rehosted"},409);
  const assetId=String(item.metadata?.content_asset_id||""); if(!/^[0-9a-f-]{36}$/i.test(assetId))return out({error:"Missing content_asset_id"},409);
  const {data:asset,error:assetError}=await db.from("content_asset_registry").select("id,canonical_url,asset_type,mime_type,rights_status,commercial_status,qa_status,origin_review_status,rights_evidence,publish_blockers").eq("id",assetId).maybeSingle();
  if(assetError)throw assetError;
  const evidence=asset?.rights_evidence||{}; const rightsGate=asset?.rights_status==="verified"||(asset?.rights_status==="attested"&&evidence.rights_verified===true&&evidence.configured_republication_authorized===true&&evidence.allowlist_member===true&&evidence.source_registry_active===true&&evidence.source_registry_capture_enabled===true); if(!asset||asset.asset_type!=="video"||!rightsGate||asset.commercial_status!=="authorized"||asset.qa_status!=="approved"||asset.origin_review_status!=="approved"||!asset.rights_evidence||Object.keys(asset.rights_evidence).length===0||(Array.isArray(asset.publish_blockers)&&asset.publish_blockers.length>0))return out({error:"Rights/origin/QA gate did not pass"},409);
  let publicUrl=String(asset.canonical_url||""); let bytes=0; let mime=String(asset.mime_type||"video/mp4").toLowerCase();
  const alreadyR2=allowedR2Media(publicUrl,"video"); const alreadyRehosted=publicUrl.startsWith(PUBLIC_PREFIX)&&/^[0-9a-f-]{36}[.](mp4|mov)$/.test(publicUrl.slice(PUBLIC_PREFIX.length)); let storageBackend="unknown";
  if(alreadyR2){
    const check=await fetch(publicUrl,{method:"HEAD",redirect:"follow",signal:AbortSignal.timeout(10000)});
    if(!check.ok||!(check.headers.get("content-type")||"").toLowerCase().startsWith("video/"))return out({error:"Existing R2 media object failed HEAD verification",status:check.status},502);
    bytes=Number(check.headers.get("content-length")||"0"); storageBackend="cloudflare-r2";
  }else if(alreadyRehosted){
    // Idempotent recovery: storage upload succeeded on a prior attempt; only the queue-row update remained.
    const check=await fetch(publicUrl,{method:"HEAD",redirect:"follow",signal:AbortSignal.timeout(10000)});
    if(!check.ok||!(check.headers.get("content-type")||"").toLowerCase().startsWith("video/"))return out({error:"Existing public media object failed HEAD verification",status:check.status},502);
    bytes=Number(check.headers.get("content-length")||"0"); storageBackend="supabase-storage";
  }else{
    if(!allowedDropbox(publicUrl)&&!allowedBlob(publicUrl))return out({error:"Source must be an allowlisted public Dropbox or Vercel Blob video URL"},400);
    const source=await fetch(publicUrl,{redirect:"follow",signal:AbortSignal.timeout(30000)});
    if(!source.ok||!source.body)return out({error:"Source download failed",source_status:source.status},502);
    mime=(source.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
    const length=Number(source.headers.get("content-length")||"0");
    const binaryMime=mime==="application/binary"||mime==="application/octet-stream";
    if(mime!=="video/mp4"&&mime!=="video/quicktime"&&!binaryMime){await source.body.cancel();return out({error:"Unsupported source MIME type",mime},415);}
    if(length>50*1024*1024){await source.body.cancel();return out({error:"Source exceeds 50 MB rehost limit",length},413);}
    const data=await source.arrayBuffer(); bytes=data.byteLength;
    if(bytes<1024||bytes>50*1024*1024)return out({error:"Downloaded media size outside allowed range",bytes},413);
    const isFtyp=data.byteLength>12&&String.fromCharCode(...new Uint8Array(data.slice(4,8)))==="ftyp";
    if(binaryMime&&!isFtyp)return out({error:"Binary source failed MP4/QuickTime signature verification",mime},415);
    if(binaryMime)mime=new URL(publicUrl).pathname.toLowerCase().endsWith(".mov")?"video/quicktime":"video/mp4";
    const ext=mime==="video/quicktime"?"mov":"mp4"; const path=`bigo-highlights/${assetId}.${ext}`; const r2Endpoint=Deno.env.get("R2_UPLOAD_ENDPOINT")||""; const r2Token=Deno.env.get("R2_WRITE_TOKEN")||"";
    if(r2Endpoint||r2Token){
      if(!r2Endpoint||!r2Token)throw new Error("R2 upload configuration incomplete: set R2_UPLOAD_ENDPOINT and R2_WRITE_TOKEN together");
      const r2Key=`chatb2k/bigo-highlights/${assetId}.${ext}`; const endpoint=new URL(r2Endpoint); endpoint.searchParams.set("key",r2Key);
      const uploaded=await fetch(endpoint,{method:"POST",headers:{"authorization":`Bearer ${r2Token}`,"content-type":mime},body:data,signal:AbortSignal.timeout(30000)});
      const uploadResult=await uploaded.json().catch(()=>({}));
      if(!uploaded.ok||uploadResult?.ok!==true||typeof uploadResult?.media_url!=="string")throw new Error(`Cloudflare R2 upload failed: HTTP ${uploaded.status} ${JSON.stringify(uploadResult).slice(0,500)}`);
      publicUrl=uploadResult.media_url;
      if(!publicUrl.startsWith(`https://media.resofit.fit/${r2Key}`))throw new Error("R2 media URL verification failed");
      const check=await fetch(publicUrl,{method:"HEAD",redirect:"follow",signal:AbortSignal.timeout(10000)});
      if(!check.ok||!(check.headers.get("content-type")||"").toLowerCase().startsWith("video/"))throw new Error(`R2 CDN readback failed: HTTP ${check.status}`);
      storageBackend="cloudflare-r2";
    }else{
      const {error:uploadError}=await db.storage.from(BUCKET).upload(path,data,{contentType:mime,upsert:true,cacheControl:"31536000"});
      if(uploadError)throw new Error(`Public media upload failed: ${JSON.stringify(uploadError)}`);
      const {data:publicData}=db.storage.from(BUCKET).getPublicUrl(path); publicUrl=String(publicData?.publicUrl||"");
      if(!publicUrl.startsWith(PUBLIC_PREFIX))throw new Error("Public media URL verification failed");
      const readback=await fetch(publicUrl,{method:"HEAD",redirect:"follow",signal:AbortSignal.timeout(10000)});
      if(!readback.ok||!(readback.headers.get("content-type")||"").toLowerCase().startsWith("video/"))throw new Error(`Supabase Storage readback failed: HTTP ${readback.status}`);
      bytes=Number(readback.headers.get("content-length")||bytes);
      storageBackend="supabase-storage-fallback";
    }
    const {error:registryUpdateError}=await db.from("content_asset_registry").update({canonical_url:publicUrl,mime_type:mime,updated_at:new Date().toISOString()}).eq("id",assetId);
    if(registryUpdateError)throw new Error(`Registry update failed: ${JSON.stringify(registryUpdateError)}`);
  }
  let coverUrl=String(item.metadata?.cover_url||"");
  if(coverUrl&&!coverUrl.startsWith(PUBLIC_PREFIX)&&!allowedR2Media(coverUrl,"image")){
    if(!allowedDropbox(coverUrl)&&!allowedBlobCover(coverUrl))throw new Error("Cover source must be an allowlisted Dropbox or Vercel Blob image URL");
    const coverResponse=await fetch(coverUrl,{redirect:"follow",signal:AbortSignal.timeout(30000)});
    if(!coverResponse.ok)throw new Error(`Cover download failed: HTTP ${coverResponse.status}`);
    const coverMime=(coverResponse.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
    if(coverMime!=="image/jpeg"&&coverMime!=="image/png"&&coverMime!=="image/webp")throw new Error("Cover MIME type is not an approved image");
    const coverData=await coverResponse.arrayBuffer();
    if(coverData.byteLength<256||coverData.byteLength>5*1024*1024)throw new Error("Cover image size outside allowed range");
    const coverExt=coverMime==="image/png"?"png":coverMime==="image/webp"?"webp":"jpg";
    const coverPath=`bigo-highlights/${assetId}-cover.${coverExt}`;
    const {error:coverUploadError}=await db.storage.from(BUCKET).upload(coverPath,coverData,{contentType:coverMime,upsert:true,cacheControl:"31536000"});
    if(coverUploadError)throw new Error(`Public cover upload failed: ${JSON.stringify(coverUploadError)}`);
    const {data:coverPublic}=db.storage.from(BUCKET).getPublicUrl(coverPath);coverUrl=String(coverPublic?.publicUrl||"");
    if(!coverUrl.startsWith(PUBLIC_PREFIX))throw new Error("Public cover URL verification failed");
    const coverReadback=await fetch(coverUrl,{method:"HEAD",redirect:"follow",signal:AbortSignal.timeout(10000)});
    if(!coverReadback.ok||!(coverReadback.headers.get("content-type")||"").toLowerCase().startsWith("image/"))throw new Error(`Cover readback failed: HTTP ${coverReadback.status}`);
  }
  if(coverUrl&&allowedR2Media(coverUrl,"image")){const coverHead=await fetch(coverUrl,{method:"HEAD",redirect:"follow",signal:AbortSignal.timeout(10000)});if(!coverHead.ok||!(coverHead.headers.get("content-type")||"").toLowerCase().startsWith("image/"))throw new Error(`Existing R2/CDN cover failed HEAD verification: HTTP ${coverHead.status}`);}
  const {error:queueUpdateError}=await db.from("content_queue").update({asset_url:publicUrl,status:item.status==="scheduled"?"scheduled":"approved",error_message:null,updated_at:new Date().toISOString(),metadata:{...(item.metadata||{}),cover_url:coverUrl||item.metadata?.cover_url,rehosted_from:String(item.asset_url||""),rehosted_at:new Date().toISOString(),rehost_bucket:storageBackend,rehost_attempts:0,rehost_last_error:null}}).eq("id",queueId);
  if(queueUpdateError)throw new Error(`Queue update failed: ${JSON.stringify(queueUpdateError)}`);
  const {error:queueSyncError}=await db.from("content_queue").update({asset_url:publicUrl,updated_at:new Date().toISOString()}).or(`metadata->>content_asset_id.eq.${assetId},metadata->>source_asset_id.eq.${assetId}`);
  if(queueSyncError)throw new Error(`Related queue URL sync failed: ${JSON.stringify(queueSyncError)}`);
  return out({ok:true,queue_id:queueId,content_asset_id:assetId,public_url:publicUrl,bytes,mime,rights_gate:asset.rights_status==="verified"?"verified":"user_attested_authorized",storage_backend:storageBackend,recovery:alreadyRehosted||alreadyR2});
 }catch(e){
  const message=e instanceof Error?e.message:JSON.stringify(e);
  if(activeQueueId){
   try{
    const {data:row}=await db.from("content_queue").select("id,status,metadata").eq("id",activeQueueId).maybeSingle();
    if(row){
     const attempts=Number(row.metadata?.rehost_attempts||0)+1;
     const terminal=attempts>=3;
     await db.from("content_queue").update({
      status:terminal?"failed":row.status,
      error_message:message,
      updated_at:new Date().toISOString(),
      metadata:{...(row.metadata||{}),rehost_attempts:attempts,rehost_last_error:message,rehost_last_attempt_at:new Date().toISOString()}
     }).eq("id",activeQueueId);
    }
   }catch(retryError){console.error("Unable to persist rehost retry state",retryError);}
  }
  return out({ok:false,error:message},500);
 }
});
