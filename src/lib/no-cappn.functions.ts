import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasPermission } from "@/lib/admin-guard.server";

type Row = Record<string, any>;

export const getNoCappnOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasPermission(context.supabase, context.userId, "content.manage"))) {
      return { ok: false as const, error: "You need the content.manage capability to access No Cappn operations." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [sources, highlights, assets, queue, agencies] = await Promise.all([
      db.from("bigo_sources")
        .select("id,bigo_id,display_name,active,capture_enabled,metadata")
        .order("display_name", { ascending: true })
        .limit(500),
      db.from("resofit_live_highlights")
        .select("id,host_id,host_name,title,status,content_asset_id,content_queue_id,created_at,processed_at,error_message")
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("content_asset_registry")
        .select("id,source_asset_id,canonical_url,qa_status,rights_status,commercial_status,created_at", { count: "exact" })
        .eq("campaign", "live_stream_highlights")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("content_queue")
        .select("id,title,status,platform,campaign_key,scheduled_at,created_at,metadata")
        .eq("campaign_key", "live_stream_highlights")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("no_cappn_agencies")
        .select("id,name,slug,status,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const errors = [
      sources.error ? { source: "BIGO source registry", message: sources.error.message } : null,
      highlights.error ? { source: "Live highlights", message: highlights.error.message } : null,
      assets.error ? { source: "Content asset registry", message: assets.error.message } : null,
      queue.error ? { source: "Recruitment content queue", message: queue.error.message } : null,
      agencies.error ? { source: "Agency registry", message: agencies.error.message } : null,
    ].filter(Boolean) as { source: string; message: string }[];

    const sourceRows = (sources.data ?? []) as Row[];
    const highlightRows = (highlights.data ?? []) as Row[];
    const assetRows = (assets.data ?? []) as Row[];
    const queueRows = (queue.data ?? []) as Row[];
    const eligibleAssets = assetRows.filter((a) =>
      a.rights_status === "verified" &&
      a.commercial_status === "authorized" &&
      a.qa_status === "approved" &&
      typeof a.canonical_url === "string" &&
      a.canonical_url.startsWith("https://")
    );

    const eligibleAssetIds = new Set(eligibleAssets.map((a) => String(a.id)));
    const campaignEligibleHighlights = highlightRows.filter((h) => eligibleAssetIds.has(String(h.content_asset_id ?? "")));

    const queueCounts = queueRows.reduce((acc: Record<string, number>, row) => {
      const status = String(row.status ?? "unknown");
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      ok: true as const,
      generated_at: new Date().toISOString(),
      sources: {
        total: sourceRows.length,
        active: sourceRows.filter((s) => s.active === true).length,
        capture_enabled: sourceRows.filter((s) => s.active === true && s.capture_enabled === true).length,
        source_rows: sourceRows,
      },
      highlights: {
        recent: highlightRows,
        recent_count: highlightRows.length,
        processed: highlightRows.filter((h) => Boolean(h.content_asset_id)).length,
        failed: highlightRows.filter((h) => h.status === "failed").length,
        campaign_eligible: campaignEligibleHighlights,
      },
      assets: {
        total: assets.count ?? assetRows.length,
        recent: assetRows,
        eligible: eligibleAssets.length,
      },
      campaigns: {
        recent: queueRows,
        status_counts: queueCounts,
        total_recent: queueRows.length,
      },
      errors,
      evidence: {
        capture_workflow: "configured",
        capture_execution: "not_connected_to_dashboard",
        media_storage: "configured_readback_unverified",
        publisher: "existing_queue_and_router",
      },
    };
  });
