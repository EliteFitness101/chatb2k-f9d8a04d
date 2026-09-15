import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const HighlightSchema = z.object({
  host_id: z.string().min(1).max(256),
  host_name: z.string().max(256).optional().nullable(),
  original_url: z.string().url(),
  imagekit_url: z.string().url(),
  title: z.string().max(500).optional().nullable(),
  caption: z.string().max(5000).optional().nullable(),
  target_channels: z.array(z.string().min(1).max(64)).default([]),
  fingerprint: z.string().min(8).max(512).optional().nullable(),
  source_asset_id: z.string().max(512).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const IngestSchema = z.object({
  highlight: HighlightSchema,
  ingest_key: z.string().min(1).optional(),
});

function configuredIngestKey() {
  return process.env.CHATB2K_LIVE_INGEST_KEY ?? process.env.LIVE_HIGHLIGHTS_INGEST_KEY ?? null;
}

function assertIngestKey(provided?: string) {
  const expected = configuredIngestKey();
  if (!expected || !provided || provided !== expected) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

/**
 * Server-only bridge for BIGO/live-stream scrapers.
 * It writes to the staging catalog and then registers the same asset in the
 * canonical content_asset_registry/content_queue pipeline. No alternate
 * publisher or client-side service-role access is introduced.
 */
export const ingestLiveHighlight = createServerFn({ method: "POST" })
  .inputValidator((data) => IngestSchema.parse(data))
  .handler(async ({ data }) => {
    assertIngestKey(data.ingest_key);

    const h = data.highlight;
    const fingerprint = h.fingerprint ?? `${h.host_id}:${h.original_url}:${h.imagekit_url}`;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("resofit_live_highlights")
      .select("id,status,content_asset_id,content_queue_id")
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (existingError) {
      console.error("[live-highlights] duplicate lookup failed", existingError);
      throw new Error("Live highlight lookup failed");
    }

    if (existing) {
      return { ok: true as const, duplicate: true as const, highlight: existing };
    }

    const { data: highlight, error: insertError } = await supabaseAdmin
      .from("resofit_live_highlights")
      .insert({
        host_id: h.host_id,
        host_name: h.host_name ?? null,
        original_url: h.original_url,
        imagekit_url: h.imagekit_url,
        title: h.title ?? null,
        caption: h.caption ?? null,
        target_channels: h.target_channels,
        fingerprint,
        source_asset_id: h.source_asset_id ?? fingerprint,
        metadata: h.metadata,
        status: "processing",
        processing_started_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertError || !highlight) {
      console.error("[live-highlights] staging insert failed", insertError);
      throw new Error("Could not stage live highlight");
    }

    try {
      const assetPayload = {
        source_provider: "bigo_live",
        source_asset_id: h.source_asset_id ?? fingerprint,
        source_url: h.original_url,
        canonical_url: h.imagekit_url,
        brand: "Resonance Fitness",
        campaign: "live_stream_highlights",
        asset_type: "video",
        mime_type: "video/mp4",
        rights_status: "pending_review",
        commercial_status: "pending_review",
        tiktok_eligible: h.target_channels.includes("tiktok"),
        youtube_eligible: h.target_channels.includes("youtube"),
        google_business_eligible: h.target_channels.includes("google_business"),
        countries_allowed: ["NG"],
        qa_status: "pending",
        alt_text: h.title ?? h.host_name ?? "ResoFit live-stream highlight",
        content_pillar: "live_stream",
        fingerprint,
        intelligence: h.metadata,
      };

      const { data: asset, error: assetError } = await supabaseAdmin
        .from("content_asset_registry")
        .upsert(assetPayload, { onConflict: "fingerprint" })
        .select("id")
        .single();

      if (assetError || !asset) throw assetError ?? new Error("Asset registration failed");

      const platforms = h.target_channels.length ? h.target_channels : ["tiktok", "youtube", "google_business"];
      const { data: queue, error: queueError } = await supabaseAdmin
        .from("content_queue")
        .insert({
          title: h.title ?? `ResoFit Live Highlight — ${h.host_name ?? h.host_id}`,
          asset_url: h.imagekit_url,
          public_id: h.source_asset_id ?? fingerprint,
          caption: h.caption ?? h.title ?? "Live from the ResoFit movement.",
          platforms,
          status: "draft",
          metadata: {
            source: "bigo_live",
            live_highlight_id: highlight.id,
            content_asset_id: asset.id,
            host_id: h.host_id,
            host_name: h.host_name ?? null,
            original_url: h.original_url,
            fingerprint,
            ...h.metadata,
          },
          campaign_key: "live_stream_highlights",
          platform: platforms[0] ?? null,
          destination: "https://resofit.fit",
          safety_checked: false,
        })
        .select("id")
        .single();

      if (queueError || !queue) throw queueError ?? new Error("Content queue insert failed");

      const { error: updateError } = await supabaseAdmin
        .from("resofit_live_highlights")
        .update({
          status: "posted",
          content_asset_id: asset.id,
          content_queue_id: queue.id,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", highlight.id);

      if (updateError) throw updateError;

      return { ok: true as const, duplicate: false as const, highlight_id: highlight.id, content_asset_id: asset.id, content_queue_id: queue.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown processing error";
      await supabaseAdmin
        .from("resofit_live_highlights")
        .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
        .eq("id", highlight.id);
      console.error("[live-highlights] canonical content pipeline failed", error);
      throw new Error("Live highlight was staged but canonical content registration failed");
    }
  });
