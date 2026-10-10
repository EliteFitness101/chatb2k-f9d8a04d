import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(supabaseUrl,serviceKey);
const ROOT=Deno.env.get("GOOGLE_DRIVE_ROOT_FOLDER_ID")||"1d51bGyz9dbAGi1-_vZn4i7Yywm938BIP";
const clientId=Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")||"";
const clientSecret=Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")||"";
const refreshToken=Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN")||"";
const CRON_SECRET=Deno.env.get("BUFFER_CRON_SECRET")||Deno.env.get("CONTENT_CRON_SECRET")||"";
const out=(body:unknown,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});
const isSupportedMedia=(u:string)=>{try{const x=new URL(u);const blob=/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(u);const dropbox=x.protocol==="https:"&&x.hostname==="www.dropbox.com"&&/^\/scl\/fi\/[A-Za-z0-9_-]+\/[^/]+$/.test(x.pathname)&&/^[A-Za-z0-9_-]+$/.test(x.searchParams.get("rlkey")||"")&&x.searchParams.get("dl")==="1";return x.protocol==="https:"&&(blob||dropbox)}catch{return false}};
async function accessToken(){
 if(!serviceKey)throw new Error("Supabase service key is not configured in the archive runtime");
 const response=await fetch("https://chatb2k.resofit.fit/api/google/drive-mcp/access-token",{
  method:"POST",
  headers:{"Authorization":"Bearer "+serviceKey,"Content-Type":"application/json"},
  body:"{}",
  cache:"no-store"
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.access_token)throw new Error("Google Drive token proxy failed ("+response.status+"): "+String(result.error||"access_token_missing"));
 return String(result.access_token);
}
async function driveFetch(token:string,url:string,init:RequestInit={}){
 const headers=new Headers(init.headers);headers.set("Authorization","Bearer "+token);
 return fetch(url,{...init,headers});
}
async function folder(token:string,name:string,parent:string){
 const q=encodeURIComponent("name='"+name.replace(/'/g,"\\'")+"' and '"+parent+"' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false");
 const r=await driveFetch(token,"https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,name,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true");
 const j=await r.json();if(!r.ok)throw new Error("Drive folder lookup failed: "+r.status);
 if(j.files?.[0])return j.files[0];
 const c=await driveFetch(token,"https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parent]})});
 const cj=await c.json();if(!c.ok)throw new Error("Drive folder create failed: "+c.status);return cj;
}
async function upload(token:string,mediaUrl:string,name:string,mime:string,parent:string){
 const src=await fetch(mediaUrl);if(!src.ok||!src.body)throw new Error("Source media download failed: "+src.status);
 const data=new Uint8Array(await src.arrayBuffer());
 const expectedHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",data)),x=>x.toString(16).padStart(2,"0")).join("");
 const duplicateQ=encodeURIComponent("name='"+name.replace(/'/g,"\\'")+"' and '"+parent+"' in parents and trashed=false");
 const duplicateRes=await driveFetch(token,"https://www.googleapis.com/drive/v3/files?q="+duplicateQ+"&fields=files(id,name,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=10");
 const duplicateJson=await duplicateRes.json().catch(()=>({}));
 if(!duplicateRes.ok)throw new Error("Drive duplicate check failed: "+duplicateRes.status);
 if(duplicateJson.files?.[0]?.id){
  const existing=duplicateJson.files[0];
  const check=await driveFetch(token,"https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(existing.id)+"?alt=media");
  if(!check.ok)throw new Error("Existing Drive file read-back failed: "+check.status);
  const existingBytes=new Uint8Array(await check.arrayBuffer());
  const existingHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",existingBytes)),x=>x.toString(16).padStart(2,"0")).join("");
  if(existingBytes.byteLength!==data.byteLength||existingHash!==expectedHash)throw new Error("Existing same-name Drive file checksum mismatch; refusing duplicate upload");
  return {...existing,verified:true,reused:true,size:existingBytes.byteLength,sha256:existingHash};
 }
 const init=await driveFetch(token,"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink",{method:"POST",headers:{"content-type":"application/json; charset=UTF-8","x-upload-content-type":mime,"x-upload-content-length":String(data.byteLength)},body:JSON.stringify({name,mimeType:mime,parents:[parent]})});
 if(!init.ok)throw new Error("Drive resumable init failed: "+init.status);
 const session=init.headers.get("location");if(!session)throw new Error("Drive resumable session missing");
 const put=await fetch(session,{method:"PUT",headers:{"content-length":String(data.byteLength)},body:data});
 const j=await put.json().catch(()=>({}));if(!put.ok||!j.id)throw new Error("Drive resumable upload failed: "+put.status);
 const verify=await driveFetch(token,"https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(j.id)+"?alt=media");
 if(!verify.ok)throw new Error("Drive read-back failed: "+verify.status);
 const back=new Uint8Array(await verify.arrayBuffer());
 const actualHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",back)),x=>x.toString(16).padStart(2,"0")).join("");
 if(back.byteLength!==data.byteLength||actualHash!==expectedHash)throw new Error("Drive read-back checksum mismatch");
 return {...j,verified:true,reused:false,size:back.byteLength,sha256:actualHash};
}
async function drivePath(token:string,needsReview:boolean,project:string,campaign:string,archiveClass:string){
 let f=await folder(token,"ResoFit",ROOT); f=await folder(token,"BIGO",f.id);
 const names=["raw-captures","metadata","processed","logs"];
 const made:any={};
 for(const name of names)made[name]=await folder(token,name,f.id);
 const cls=String(archiveClass||"").toLowerCase();
 if(cls.includes("metadata"))return made.metadata;
 if(cls.includes("log"))return made.logs;
 if(cls.includes("processed"))return made.processed;
 return made["raw-captures"];
}
Deno.serve(async req=>{
 if(req.method!=="POST")return out({error:"POST required"},405);
 const supplied=req.headers.get("x-content-cron-secret")||req.headers.get("x-buffer-cron-secret")||"";
 const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const cronAuthorized=!!CRON_SECRET&&supplied===CRON_SECRET;
 const internalServiceAuthorized=!!serviceKey&&bearer===serviceKey;
 if(!cronAuthorized&&!internalServiceAuthorized)return out({error:"Unauthorized"},401);
 try{
  const b:any=await req.json().catch(()=>({}));
  const batchMode=b.action==="archive_batch";
  if(!batchMode&&b.action!=="healthcheck"&&b.action!=="ensure_folders"&&!b.content_asset_id&&!b.source_asset_id)return out({error:"content_asset_id or action=archive_batch required"},400);
  if(b.action==="healthcheck"||b.action==="ensure_folders"){
   const token=await accessToken();
   const raw=await drivePath(token,false,"resofit","live_stream_highlights","CAPTURED");
   return out({ok:true,action:b.action,oauth_refresh:"success",drive_api:"success",folder_tree:"verified",raw_captures_folder_id:raw.id,folder_tree_path:"ResoFit/BIGO/{raw-captures,metadata,processed,logs}"});
  }
  const limit=Math.min(Math.max(Number(b.limit||3),1),5);
  let rows:any[]=[];
  if(batchMode){
   const q=await db.from("content_asset_drive_archives").select("id,content_asset_id,source_asset_id,source_url,blob_url,drive_root_folder_id,archive_class,archive_status,metadata").in("archive_status",["pending","failed"]).not("blob_url","is",null).order("created_at",{ascending:true}).limit(200);
   if(q.error)throw q.error;rows=(q.data||[]).filter((r:any)=>Number(r.metadata?.attempt_count||0)<3).slice(0,limit);
  }else{
   const q=await db.from("content_asset_registry").select("id,source_asset_id,source_url,canonical_url,asset_type,mime_type,campaign,rights_status,commercial_status,qa_status").eq("id",String(b.content_asset_id||b.source_asset_id)).maybeSingle();
   if(q.error)throw q.error;if(!q.data)return out({error:"Asset not found"},404);
   const asset=q.data;
   if(!["video","image","audio"].includes(String(asset.asset_type||""))||!["video/mp4","video/quicktime","image/jpeg","image/png","image/webp","image/gif","audio/mpeg","audio/mp4","audio/wav"].includes(String(asset.mime_type||"").toLowerCase())||!isSupportedMedia(String(asset.canonical_url||"")))return out({error:"Supported public media URL required (Vercel Blob or Dropbox shared link); source asset was not uploaded"},422);
   const cls=String(b.archive_class||((asset.rights_status==="generated")?"GENERATED":"CAPTURED")).toUpperCase();
   const ins=await db.from("content_asset_drive_archives").upsert({content_asset_id:asset.id,source_asset_id:String(b.source_asset_id||asset.source_asset_id),source_url:asset.source_url,blob_url:asset.canonical_url,drive_root_folder_id:ROOT,drive_path:"mcb/resonancefitnessng/chatb2k/orchestration-engine",archive_class:cls,archive_status:"pending",archive_reason:"Private archive; publication authorization is evaluated separately",metadata:{campaign:asset.campaign,rights_status:asset.rights_status,commercial_status:asset.commercial_status,qa_status:asset.qa_status,...(b.metadata||{})}},{onConflict:"drive_root_folder_id,source_asset_id,archive_class"}).select("id,content_asset_id,source_asset_id,source_url,blob_url,drive_root_folder_id,archive_class,archive_status").single();
   if(ins.error)throw ins.error;rows=[ins.data];
  }
  if(!rows.length)return out({ok:true,processed:0,message:"No pending supported-media archive records"});
  const token=await accessToken();const results=[];
  for(const row of rows){
   const now=new Date().toISOString();
   try{
    let asset:any=null;
    if(row.content_asset_id){const q=await db.from("content_asset_registry").select("id,asset_type,mime_type,canonical_url,campaign,rights_status,commercial_status,qa_status,intelligence").eq("id",row.content_asset_id).maybeSingle();if(q.error)throw q.error;asset=q.data;}
    const url=String(row.blob_url||asset?.canonical_url||"");
    if(!isSupportedMedia(url))throw new Error("Public allowlisted media URL required (Vercel Blob or Dropbox shared link)");
    if(asset&&(!["video","image","audio"].includes(String(asset.asset_type||""))||!["video/mp4","video/quicktime","image/jpeg","image/png","image/webp","image/gif","audio/mpeg","audio/mp4","audio/wav"].includes(String(asset.mime_type||"").toLowerCase())))throw new Error("Supported video, image, or audio media required");
    const needsReview=false; // Private archival is not publication; source rights metadata is preserved for downstream distribution policy.
    const project=String(row.metadata?.project||row.metadata?.brand||asset?.campaign||"resofit"); const campaign=String(row.metadata?.campaign||asset?.campaign||"uncategorized"); const target=await drivePath(token,needsReview,project,campaign,String(row.archive_class||"captured"));
    const mime=String(asset?.mime_type||row.metadata?.mime_type||"video/mp4").toLowerCase();const ext=({"video/mp4":"mp4","video/quicktime":"mov","image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","audio/mpeg":"mp3","audio/mp4":"m4a","audio/wav":"wav"} as Record<string,string>)[mime]||"bin";const fileName=(String(row.source_asset_id||row.id).replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,80)||row.id)+"."+ext;
    const f=await upload(token,url,fileName,mime,target.id);
    if(!f.verified)throw new Error("Drive checksum verification did not pass");
    const saved=await db.from("content_asset_drive_archives").update({drive_root_folder_id:ROOT,drive_path:`ResoFit/BIGO/${target.name}/${fileName}`,drive_file_id:f.id||null,drive_web_url:f.webViewLink||null,archive_status:"archived",archive_reason:null,archived_at:new Date().toISOString(),last_attempted_at:now,metadata:{...(row.metadata||{}),drive_file_name:fileName,drive_file_id:f.id||null,source_blob_url:url,checksum_verified:true,sha256:f.sha256,byte_length:f.size,reused_existing_file:f.reused===true} }).eq("id",row.id);
    if(saved.error)throw new Error("Archive database state update failed after Drive upload; retry will reconcile by file name");
    results.push({source_asset_id:row.source_asset_id,status:"archived",drive_file_id:f.id||null,checksum_verified:true,reused_existing_file:f.reused===true});
   }catch(e){
    const msg=e instanceof Error?e.message:String(e);
    await db.from("content_asset_drive_archives").update({archive_status:"failed",archive_reason:msg,last_attempted_at:now,metadata:{...(row.metadata||{}),attempt_count:Number(row.metadata?.attempt_count||0)+1,last_error_at:now}}).eq("id",row.id);
    results.push({source_asset_id:row.source_asset_id,status:"failed",reason:msg});
   }
  }
  return out({ok:results.every(x=>x.status==="archived"),processed:results.length,results,private_archive_only:true,publication_gates_unchanged:true});
 }catch(e){
  const detail=(e&&typeof e==="object")?JSON.stringify(e,(k,v)=>k==="stack"?undefined:v):String(e);
  const message=e instanceof Error?e.message:(typeof (e as any)?.message==="string"?(e as any).message:detail||"Unknown archive error");
  console.error("drive-asset-archiver failure",{message,detail});
  return out({ok:false,error:message,detail:detail?.slice(0,1200)||null},500)
 }
});