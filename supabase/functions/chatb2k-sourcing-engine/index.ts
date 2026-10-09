import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json"}});
const providers=["jumia","konga","jiji","aliexpress","alibaba","amazon","etsy","local_storefront"];

async function geminiSearch(query:string,location:string){
  const key=Deno.env.get("GEMINI_API_KEY");
  if(!key) return {status:"unconfigured",candidates:[]};
  const prompt="Search the web for currently available products matching: "+query+". Buyer location: "+location+". Return only JSON with candidates array. Each candidate must contain title, description, price, currency, stock_status, source_url, image_url, source_type. Prioritize Jumia, Konga, Jiji, AliExpress, Alibaba, Amazon, Etsy and legitimate local storefronts. Never invent URLs, prices, stock or images.";
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",{
    method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}],tools:[{googleSearch:{}}],generationConfig:{responseMimeType:"application/json"}})
  });
  const p=await r.json();
  if(!r.ok) return {status:"provider_error",candidates:[],error:p};
  const t=p?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"";
  try{return {status:"ok",candidates:(JSON.parse(t).candidates||[]).slice(0,10)};}catch{return {status:"parse_error",candidates:[]};}
}

async function processOne(req:any){
  await db.from("resofit_sourcing_requests").update({status:"searching",updated_at:new Date().toISOString()}).eq("id",req.id);
  const local=await db.from("supplier_products").select("*").ilike("title","%"+req.query+"%").eq("resale_status","approved").gt("stock_qty",0).limit(5);
  let candidates=(local.data||[]).map((p:any)=>({title:p.title,description:p.description,price:p.supplier_price,currency:p.currency,stock_status:"in_stock",source_url:p.product_url,image_url:p.image_url,source_type:"registered_supplier",supplier_product_id:p.id}));
  let provider="registered_supplier";
  if(!candidates.length){
    const g=await geminiSearch(req.query,[req.destination_city,req.destination_state,req.destination_country].filter(Boolean).join(", ")||"Nigeria");
    provider="gemini_web_search";
    candidates=g.candidates||[];
    if(!candidates.length){
      await db.from("resofit_sourcing_requests").update({status:g.status==="unconfigured"?"blocked_configuration":"search_failed",last_error:g.status,provider_attempts:{provider,status:g.status},next_attempt_at:new Date(Date.now()+15*60*1000).toISOString(),updated_at:new Date().toISOString()}).eq("id",req.id);
      await db.from("admin_audit_logs").insert({action:"external_product_sourcing_failed",resource:"resofit_sourcing_requests",metadata:{request_id:req.id,query:req.query,provider,status:g.status}});
      return {status:g.status,request_id:req.id};
    }
  }
  const candidate=candidates.find((c:any)=>c.source_url)||null;
  if(!candidate){return {status:"no_verified_source",request_id:req.id};}
  let sourceUrl="";
  try{sourceUrl=new URL(candidate.source_url).toString();}catch{
    await db.from("resofit_sourcing_requests").update({status:"search_failed",last_error:"invalid_source_url",updated_at:new Date().toISOString()}).eq("id",req.id);
    return {status:"invalid_source_url",request_id:req.id};
  }
    const firecrawlGateway=Deno.env.get("FIRECRAWL_GATEWAY_URL")||(Deno.env.get("SUPABASE_URL")+"/functions/v1/firecrawl-intelligence-gateway");
  const firecrawlResp=await fetch(firecrawlGateway,{method:"POST",headers:{"Authorization":`Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,"Content-Type":"application/json"},body:JSON.stringify({source_url:sourceUrl,observation_type:"commerce_candidate_verification",verification_state:"VERIFIED",idempotency_key:"commerce-source:"+req.id+":"+sourceUrl,correlation_id:req.id,session_id:req.session_id||null,user_id:req.customer_id||null,anonymous_id:req.anonymous_id||null,rsid:req.rsid||null,funnel_origin:req.funnel_origin||"commerce_sourcing",utm:req.utm||{},confidence:0.9})});
  const firecrawlBody=await firecrawlResp.json().catch(()=>({}));
  if(!firecrawlResp.ok||firecrawlBody?.error){await db.from("resofit_sourcing_requests").update({status:"search_failed",last_error:"firecrawl_verification_failed",provider_attempts:{provider:"firecrawl",status:firecrawlResp.status},next_attempt_at:new Date(Date.now()+15*60*1000).toISOString(),updated_at:new Date().toISOString()}).eq("id",req.id);return {status:"firecrawl_verification_failed",request_id:req.id};}
const domain=new URL(sourceUrl).hostname.replace(/^www\./,"");
  const sourceType=provider==="registered_supplier"?"registered_supplier":(providers.find(x=>domain.includes(x))||"local_storefront");
  const code=sourceType.toUpperCase().slice(0,40);
  const sup=await db.from("suppliers").upsert({name:domain,code,integration_type:"web_discovery",status:"active",base_url:new URL(sourceUrl).origin,resale_authorized:false,media_authorized:false,updated_at:new Date().toISOString()},{onConflict:"code"}).select().single();
  if(sup.error) throw sup.error;
  const supplier=sup.data;
  let sp=(await db.from("supplier_products").select("id").eq("supplier_id",supplier.id).eq("external_product_id",sourceUrl).maybeSingle()).data;
  if(!sp){
    const ins=await db.from("supplier_products").insert({supplier_id:supplier.id,external_product_id:sourceUrl,title:String(candidate.title||req.query).slice(0,250),description:candidate.description||null,product_url:sourceUrl,currency:candidate.currency||"NGN",supplier_price:Math.max(0,Math.round(Number(candidate.price)||0)),stock_qty:candidate.stock_status==="in_stock"?1:0,image_url:candidate.image_url||null,image_rights_status:"unknown",resale_status:"pending",last_source_update:new Date().toISOString(),last_verified_at:new Date().toISOString(),raw_payload:candidate}).select("id").single();
    if(ins.error) throw ins.error; sp=ins.data;
  }
  const handle=("sourced-"+req.id.slice(0,8)+"-"+String(candidate.title||req.query).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50)).slice(0,100);
  const published=Boolean(supplier.resale_authorized&&supplier.media_authorized&&candidate.image_url);
  let product=(await db.from("products").select("id").eq("handle",handle).maybeSingle()).data;
  if(!product){
    const ins=await db.from("products").insert({handle,title:String(candidate.title||req.query).slice(0,180),body_html:String(candidate.description||"Externally sourced candidate pending verification.").slice(0,10000),vendor:"ResoFlex",product_type:"Externally Sourced",tags:["ChatB2K","externally-sourced",sourceType],published,variant_price:Math.max(0,Math.round(Number(candidate.price)||0)),variant_inventory_qty:candidate.stock_status==="in_stock"?1:0,image_src:candidate.image_url||null,sku:"SRC-"+req.id.slice(0,8).toUpperCase(),fulfillment_mode:"external_source"}).select("id").single();
    if(ins.error) throw ins.error; product=ins.data;
  }
  await db.from("product_sources").insert({product_id:product.id,supplier_product_id:sp.id,source_type:sourceType,source_url:sourceUrl,source_product_id:sourceUrl,resale_authorized:supplier.resale_authorized,media_authorized:supplier.media_authorized,status:"pending"});
  await db.from("resofit_sourcing_requests").update({status:"candidate_found",selected_source:{...candidate,source_type:sourceType},selected_supplier_product_id:sp.id,generated_product_id:product.id,next_attempt_at:null,updated_at:new Date().toISOString()}).eq("id",req.id);
  await db.from("admin_audit_logs").insert({action:"external_product_candidate_found",resource:"resofit_sourcing_requests",metadata:{request_id:req.id,fulfillment_order_id:req.fulfillment_order_id,product_id:product.id,source_url:sourceUrl,source_type:sourceType,published}});
  if(req.customer_id) await db.from("chatb2k_automation_tasks").upsert({user_id:req.customer_id,task_type:"external_product_sourcing_update",channel:"dashboard",due_at:new Date().toISOString(),priority:80,status:"queued",dedupe_key:"sourcing-update:"+req.id,payload:{request_id:req.id,product_id:product.id,status:"candidate_found",source_type:sourceType}},{onConflict:"dedupe_key"});
  return {status:"candidate_found",request_id:req.id,product_id:product.id,source_type:sourceType,published};
}

Deno.serve(async req=>{
  if(req.method!=="POST") return json({error:"POST required"},405);
  const expectedSecrets = [
    Deno.env.get("SOURCING_CRON_SECRET"),
    Deno.env.get("CONTENT_CRON_SECRET"),
    Deno.env.get("BUFFER_CRON_SECRET"),
  ].filter((x): x is string => Boolean(x));
  try {
    const { data, error } = await db.rpc("get_buffer_cron_secret");
    if (!error && data) expectedSecrets.push(String(data));
  } catch {}
  const supplied = req.headers.get("x-sourcing-cron-secret") || req.headers.get("x-content-cron-secret") || req.headers.get("x-buffer-cron-secret") || "";
  if (!supplied || expectedSecrets.length === 0 || !expectedSecrets.includes(supplied)) return json({error:"unauthorized"},401);
  try{
    const body=await req.json().catch(()=>({}));
    const limit=Math.min(Math.max(Number(body.limit||5),1),20);
    const {data,error}=await db.from("resofit_sourcing_requests").select("*").in("status",["queued","search_failed","blocked_configuration"]).lte("next_attempt_at",new Date().toISOString()).order("created_at").limit(limit);
    if(error) throw error;
    const results=[];
    for(const item of data||[]){try{results.push(await processOne(item));}catch(e){await db.from("resofit_sourcing_requests").update({status:"error",last_error:String(e),next_attempt_at:new Date(Date.now()+15*60*1000).toISOString(),updated_at:new Date().toISOString()}).eq("id",item.id);results.push({status:"error",request_id:item.id});}}
    return json({engine:"ChatB2K sourcing engine",model:"gemini-3.7-flash",providers,processed:results.length,results});
  }catch(e){console.error(e);return json({error:"internal_error"},500);}
});