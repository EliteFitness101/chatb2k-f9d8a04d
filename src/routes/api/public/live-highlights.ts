import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

type LiveHighlightAdmin = typeof supabaseAdmin & {
  from(table: "resofit_live_highlights"): any;
};

const liveDb = supabaseAdmin as LiveHighlightAdmin;

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

function unauthorized() {
  return Response.json(
    { success: false, error: "Unauthorized: Invalid or missing ingest key" },
    { status: 401 },
  );
}

export const Route = createFileRoute("/api/public/live-highlights")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedKey = process.env.CHATB2K_LIVE_INGEST_KEY;
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

        if (!expectedKey || !token || token !== expectedKey) {
          return unauthorized();
        }

        try {
          const parsed = HighlightSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json(
              { success: false, error: "Invalid highlight payload", details: parsed.error.flatten() },
              { status: 400 },
            );
          }

          const h = parsed.data;
          const fingerprint =
            h.fingerprint ?? `${h.host_id}:${h.original_url}:${h.imagekit_url}`;

          const { data: existing, error: existingError } = await liveDb
            .from("resofit_live_highlights")
            .select("id,status,content_asset_id,content_queue_id")
            .eq("fingerprint", fingerprint)
            .maybeSingle();

          if (existingError) throw existingError;

          if (existing) {
            return Response.json({
              success: true,
              duplicate: true,
              message: "Highlight already ingested",
              data: existing,
            });
          }

          const { data: highlight, error: insertError } = await liveDb
            .from("resofit_live_highlights")
            .insert({
              host_id: h.host_id,
              host_name: h.host_name ?? "BIGO Live Host",
              original_url: h.original_url,
              imagekit_url: h.imagekit_url,
              title: h.title ?? "Live Performance Highlight",
              caption: h.caption ?? "",
              target_channels: h.target_channels.length
                ? h.target_channels
                : ["tiktok", "youtube", "google_business"],
              fingerprint,
              source_asset_id: h.source_asset_id ?? fingerprint,
              metadata: h.metadata,
              status: "processing",
              processing_started_at: new Date().toISOString(),
            })
            .select("*")
            .single();

          if (insertError || !highlight) {
            throw insertError ?? new Error("Could not stage live highlight");
          }

          try {
            const platforms = h.target_channels.length
              ? h.target_channels
              : ["tiktok", "youtube", "google_business"];

            const { data: asset, error: assetError } = await supabaseAdmin
              .from("content_asset_registry")
              .upsert(
                {
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
                  tiktok_eligible: platforms.includes("tiktok"),
                  youtube_eligible: platforms.includes("youtube"),
                  google_business_eligible: platforms.includes("google_business"),
                  countries_allowed: ["NG"],
                  qa_status: "pending",
                  alt_text: h.title ?? h.host_name ?? "ResoFit live-stream highlight",
                  content_pillar: "live_stream",
                  fingerprint,
                  intelligence: h.metadata,
                },
                { onConflict: "fingerprint" },
              )
              .select("id")
              .single();

            if (assetError || !asset) {
              throw assetError ?? new Error("Asset registration failed");
            }

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

            if (queueError || !queue) {
              throw queueError ?? new Error("Content queue insert failed");
            }

            const { error: updateError } = await liveDb
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

            return Response.json({
              success: true,
              duplicate: false,
              message: "Highlight successfully ingested into the ResoFit content pipeline",
              data: {
                highlight_id: highlight.id,
                content_asset_id: asset.id,
                content_queue_id: queue.id,
              },
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown processing error";
            await liveDb
              .from("resofit_live_highlights")
              .update({
                status: "failed",
                error_message: message,
                updated_at: new Date().toISOString(),
              })
              .eq("id", highlight.id);
            throw error;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown API error";
          console.error("[live-highlights] API route error", error);
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
