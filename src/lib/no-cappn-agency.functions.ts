import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const denied = { ok: false as const, error: "Agency access is not authorized." };

export const getNoCappnAgencyWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { data: memberships, error: membershipError } = await db
      .from("no_cappn_agency_memberships")
      .select("agency_id,role,status")
      .eq("user_id", context.userId)
      .eq("status", "active");
    if (membershipError) {
      return { ok: false as const, error: "Agency workspace schema is not deployed or membership lookup failed." };
    }

    const agencyIds = (memberships ?? []).map((m: any) => m.agency_id);
    if (!agencyIds.length) return { ok: true as const, agencies: [], memberships: [], hosts: [], campaigns: [], eligibleHighlights: [], assets: [] };

    const [agencies, hosts, campaigns, campaignAssets] = await Promise.all([
      db.from("no_cappn_agencies").select("id,name,slug,status,created_at").in("id", agencyIds),
      db.from("no_cappn_agency_hosts").select("id,agency_id,source_id,status,created_at").in("agency_id", agencyIds),
      db.from("no_cappn_campaigns").select("id,agency_id,host_mapping_id,name,objective,primary_platform,application_url,status,created_at").in("agency_id", agencyIds).order("created_at", { ascending: false }),
      db.from("no_cappn_campaign_assets").select("id,agency_id,campaign_id,highlight_id,asset_id,approval_status,review_note,created_at").in("agency_id", agencyIds),
    ]);
    const errors = [agencies.error, hosts.error, campaigns.error, campaignAssets.error].filter(Boolean);
    if (errors.length) return { ok: false as const, error: "Agency workspace could not load all tenant-scoped records." };

    const verifiedHosts = (hosts.data ?? []).filter((h: any) => h.status === "verified");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sourceIds = [...new Set(verifiedHosts.map((h: any) => h.source_id))];
    const { data: sources } = sourceIds.length
      ? await supabaseAdmin.from("bigo_sources").select("id,bigo_id,display_name").in("id", sourceIds)
      : { data: [] as any[] };
    const sourceById = new Map((sources ?? []).map((s: any) => [s.id, s]));
    const bigoIds = [...new Set(verifiedHosts.map((h: any) => sourceById.get(h.source_id)?.bigo_id).filter(Boolean))] as string[];

    let eligibleHighlights: any[] = [];
    if (bigoIds.length) {
      const { data: highlights } = await supabaseAdmin
        .from("resofit_live_highlights")
        .select("id,host_id,host_name,title,status,content_asset_id,created_at,processed_at")
        .in("host_id", bigoIds)
        .not("content_asset_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      const assetIds = [...new Set((highlights ?? []).map((h: any) => h.content_asset_id).filter(Boolean))];
      const { data: assets } = assetIds.length
        ? await supabaseAdmin.from("content_asset_registry")
            .select("id,canonical_url,rights_status,commercial_status,qa_status,asset_type")
            .in("id", assetIds)
        : { data: [] as any[] };
      const assetById = new Map((assets ?? []).map((a: any) => [a.id, a]));
      eligibleHighlights = (highlights ?? []).flatMap((h: any) => {
        const asset = assetById.get(h.content_asset_id);
        const host = verifiedHosts.find((m: any) => sourceById.get(m.source_id)?.bigo_id === h.host_id);
        if (!asset || !host || asset.rights_status !== "verified" || asset.commercial_status !== "authorized" || asset.qa_status !== "approved" || !String(asset.canonical_url ?? "").startsWith("https://")) return [];
        return [{ ...h, agency_id: host.agency_id, host_mapping_id: host.id, asset }];
      });
    }

    return {
      ok: true as const,
      agencies: agencies.data ?? [],
      memberships: memberships ?? [],
      hosts: hosts.data ?? [],
      campaigns: campaigns.data ?? [],
      assets: campaignAssets.data ?? [],
      eligibleHighlights,
    };
  });

export const createNoCappnAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: agencyId, error } = await db.rpc("create_no_cappn_agency", {
      p_name: data.name,
      p_slug: data.slug,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, agencyId };
  });

export const createNoCappnCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    agencyId: z.string().uuid(),
    hostMappingId: z.string().uuid(),
    name: z.string().trim().min(2).max(160),
    platform: z.enum(["tiktok", "instagram", "youtube", "facebook"]),
    applicationUrl: z.string().url().refine((v) => v.startsWith("https://"), "HTTPS URL required"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: row, error } = await db.from("no_cappn_campaigns").insert({
      agency_id: data.agencyId,
      host_mapping_id: data.hostMappingId,
      name: data.name,
      primary_platform: data.platform,
      application_url: data.applicationUrl,
      created_by: context.userId,
      status: "draft",
    }).select("id,agency_id,name,status").single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, campaign: row };
  });

export const attachNoCappnHighlight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    campaignId: z.string().uuid(),
    highlightId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign } = await supabaseAdmin.from("no_cappn_campaigns")
      .select("id,agency_id,host_mapping_id")
      .eq("id", data.campaignId).maybeSingle();
    if (!campaign) return denied;

    const { data: membership } = await supabaseAdmin.from("no_cappn_agency_memberships")
      .select("agency_id").eq("agency_id", campaign.agency_id)
      .eq("user_id", context.userId).eq("status", "active").maybeSingle();
    if (!membership) return denied;

    const { data: host } = await supabaseAdmin.from("no_cappn_agency_hosts")
      .select("id,source_id,status").eq("id", campaign.host_mapping_id)
      .eq("agency_id", campaign.agency_id).eq("status", "verified").maybeSingle();
    if (!host) return denied;

    const { data: source } = await supabaseAdmin.from("bigo_sources")
      .select("bigo_id").eq("id", host.source_id).maybeSingle();
    if (!source) return denied;

    const { data: highlight } = await supabaseAdmin.from("resofit_live_highlights")
      .select("id,host_id,content_asset_id").eq("id", data.highlightId)
      .eq("host_id", source.bigo_id).maybeSingle();
    if (!highlight?.content_asset_id) return { ok: false as const, error: "Highlight is not owned by the verified agency host." };

    const { data: asset } = await supabaseAdmin.from("content_asset_registry")
      .select("id,canonical_url,rights_status,commercial_status,qa_status")
      .eq("id", highlight.content_asset_id).maybeSingle();
    if (!asset || asset.rights_status !== "verified" || asset.commercial_status !== "authorized" ||
      asset.qa_status !== "approved" || !String(asset.canonical_url ?? "").startsWith("https://")) {
      return { ok: false as const, error: "Highlight asset has not passed rights, commercial authorization and technical QA." };
    }

    const { data: inserted, error } = await supabaseAdmin.from("no_cappn_campaign_assets").upsert({
      agency_id: campaign.agency_id,
      campaign_id: campaign.id,
      highlight_id: highlight.id,
      asset_id: asset.id,
      approval_status: "pending_review",
      created_by: context.userId,
    }, { onConflict: "campaign_id,asset_id" }).select("id,approval_status").single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, asset: inserted };
  });
