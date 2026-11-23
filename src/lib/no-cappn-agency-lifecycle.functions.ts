import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireNoCappnAuth } from "@/lib/no-cappn-auth-middleware";
const denied = { ok: false as const, error: "Agency access is not authorized." };
const hashToken = async (token: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
};
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");

export const createNoCappnAgencyInvite = createServerFn({ method: "POST" }).middleware([requireNoCappnAuth])
.inputValidator((d: unknown) => z.object({ agencyId: z.string().uuid(), email: z.string().trim().email().max(254), role: z.enum(["admin","member"]) }).parse(d))
.handler(async ({ data, context }) => {
  const db = context.supabase as any;
  const { data: member } = await db.from("no_cappn_agency_memberships").select("role")
    .eq("agency_id", data.agencyId).eq("user_id", context.userId).eq("status","active").maybeSingle();
  if (!member || !["owner","admin"].includes(member.role)) return denied;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any, email = data.email.trim().toLowerCase(), now = new Date().toISOString();
  await admin.from("no_cappn_agency_invites").update({status:"expired",updated_at:now})
    .eq("agency_id",data.agencyId).eq("invited_email",email).eq("status","pending").lt("expires_at",now);
  const token = newToken(), tokenHash = await hashToken(token), expiresAt = new Date(Date.now()+7*86400000).toISOString();
  const { error } = await admin.from("no_cappn_agency_invites").insert({
    agency_id:data.agencyId,invited_email:email,role:data.role,token_hash:tokenHash,expires_at:expiresAt,invited_by:context.userId,status:"pending"
  });
  if(error) return {ok:false as const,error:error.message};
  return {ok:true as const,inviteUrl:`https://chatb2k.resofit.fit/agency/no-cappn?invite=${token}`,expiresAt};
});

export const acceptNoCappnAgencyInvite = createServerFn({ method: "POST" }).middleware([requireNoCappnAuth])
.inputValidator((d: unknown) => z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).parse(d))
.handler(async ({data,context}) => {
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server"), admin=supabaseAdmin as any;
  const {data:user,error:userError}=await admin.auth.admin.getUserById(context.userId);
  const email=String(user?.user?.email??"").trim().toLowerCase();
  if(userError||!email) return denied;
  const {data:agencyId,error}=await admin.rpc("accept_no_cappn_agency_invite",{p_token_hash:await hashToken(data.token),p_user_id:context.userId,p_email:email});
  if(error) return {ok:false as const,error:"Invitation is invalid, expired, already used, or belongs to another email."};
  return {ok:true as const,agencyId};
});

export const submitNoCappnCampaign = createServerFn({ method: "POST" }).middleware([requireNoCappnAuth])
.inputValidator((d: unknown)=>z.object({campaignId:z.string().uuid()}).parse(d))
.handler(async ({data,context})=>{
  const db=context.supabase as any;
  const {data:campaign}=await db.from("no_cappn_campaigns").select("id,agency_id,status").eq("id",data.campaignId).maybeSingle();
  if(!campaign||campaign.status!=="draft") return denied;
  const {data:membership}=await db.from("no_cappn_agency_memberships").select("agency_id")
    .eq("agency_id",campaign.agency_id).eq("user_id",context.userId).eq("status","active").maybeSingle();
  if(!membership) return denied;
  const {count,error:assetError}=await db.from("no_cappn_campaign_assets").select("id",{count:"exact",head:true})
    .eq("campaign_id",campaign.id).eq("approval_status","approved");
  if(assetError||!count) return {ok:false as const,error:"At least one operator-approved highlight is required before campaign submission."};
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server"), admin=supabaseAdmin as any;
  const {data:updated,error}=await admin.from("no_cappn_campaigns").update({status:"pending_review"})
    .eq("id",campaign.id).eq("status","draft").select("id,status").maybeSingle();
  if(error||!updated) return {ok:false as const,error:error?.message??"Campaign changed before submission; refresh and retry."};
  return {ok:true as const,campaign:updated};
});

export const reviewNoCappnCampaign = createServerFn({method:"POST"}).middleware([requireNoCappnAuth])
.inputValidator((d:unknown)=>z.object({campaignId:z.string().uuid(),decision:z.enum(["approved","rejected"]),note:z.string().trim().max(1000).optional()}).parse(d))
.handler(async ({data,context})=>{
  const {hasPermission}=await import("@/lib/admin-guard.server");
  if(!(await hasPermission(context.supabase,context.userId,"content.manage"))) return denied;
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server"), admin=supabaseAdmin as any;
  const {data:campaign}=await admin.from("no_cappn_campaigns").select("id,agency_id,host_mapping_id,status").eq("id",data.campaignId).maybeSingle();
  if(!campaign||campaign.status!=="pending_review") return {ok:false as const,error:"Campaign is not awaiting review."};
  if(data.decision==="approved"){
    const [{data:host},{data:links}]=await Promise.all([
      admin.from("no_cappn_agency_hosts").select("id,source_id,status").eq("id",campaign.host_mapping_id).eq("agency_id",campaign.agency_id).eq("status","verified").maybeSingle(),
      admin.from("no_cappn_campaign_assets").select("asset_id,highlight_id").eq("campaign_id",campaign.id).eq("approval_status","approved")
    ]);
    if(!host||!links?.length) return {ok:false as const,error:"Approval requires a verified host and an operator-approved highlight."};
    const {data:source}=await admin.from("bigo_sources").select("bigo_id,active,capture_enabled").eq("id",host.source_id).maybeSingle();
    if(!source?.active||!source?.capture_enabled) return {ok:false as const,error:"Assigned BIGO source is no longer active and capture-enabled."};
    const ids=links.map((x:any)=>x.highlight_id), assetIds=links.map((x:any)=>x.asset_id);
    const [{data:highlights},{data:assets}]=await Promise.all([
      admin.from("resofit_live_highlights").select("id,host_id,content_asset_id").in("id",ids),
      admin.from("content_asset_registry").select("id,canonical_url,rights_status,commercial_status,qa_status").in("id",assetIds)
    ]);
    const hmap=new Map((highlights??[]).map((h:any)=>[h.id,h]));
    const eligible=new Set((assets??[]).filter((a:any)=>a.rights_status==="verified"&&a.commercial_status==="authorized"&&a.qa_status==="approved"&&String(a.canonical_url??"").startsWith("https://")).map((a:any)=>a.id));
    const valid=links.some((x:any)=>{const h:any=hmap.get(x.highlight_id);return h?.host_id===source.bigo_id&&h?.content_asset_id===x.asset_id&&eligible.has(x.asset_id);});
    if(!valid) return {ok:false as const,error:"No attached highlight currently passes host provenance, rights, commercial authorization and QA."};
  }
  const {data:updated,error}=await admin.from("no_cappn_campaigns").update({status:data.decision,review_note:data.note??null,reviewed_by:context.userId,reviewed_at:new Date().toISOString()})
    .eq("id",campaign.id).eq("status","pending_review").select("id,status").maybeSingle();
  if(error||!updated) return {ok:false as const,error:error?.message??"Campaign review could not be saved."};
  return {ok:true as const,campaign:updated};
});


export const getNoCappnCampaignReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireNoCappnAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "content.manage"))) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: campaigns, error } = await admin.from("no_cappn_campaigns")
      .select("id,agency_id,host_mapping_id,name,primary_platform,application_url,created_at")
      .eq("status", "pending_review").order("created_at", { ascending: true }).limit(100);
    if (error) return { ok: false as const, error: error.message, rows: [] };
    const agencyIds = [...new Set((campaigns ?? []).map((c: any) => c.agency_id))];
    const campaignIds = (campaigns ?? []).map((c: any) => c.id);
    const [agencies, links] = await Promise.all([
      agencyIds.length ? admin.from("no_cappn_agencies").select("id,name").in("id", agencyIds) : { data: [] },
      campaignIds.length ? admin.from("no_cappn_campaign_assets").select("campaign_id,approval_status").in("campaign_id", campaignIds) : { data: [] },
    ]);
    const agencyById = new Map((agencies.data ?? []).map((a: any) => [a.id, a.name]));
    return { ok: true as const, rows: (campaigns ?? []).map((c: any) => ({
      ...c, agency_name: agencyById.get(c.agency_id) ?? "Agency",
      approved_assets: (links.data ?? []).filter((a: any) => a.campaign_id === c.id && a.approval_status === "approved").length,
    })) };
  });
