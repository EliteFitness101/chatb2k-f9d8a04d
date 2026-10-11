import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

type LiveHighlightAdmin = typeof supabaseAdmin & { from(table: "resofit_live_highlights"): any };
const liveDb = supabaseAdmin as LiveHighlightAdmin;

const HighlightSchema = z.object({
  host_id: z.string().min(1).max(256),
  host_name: z.string().max(256).optional().nullable(),
  original_url: z.string().url(),
  imagekit_url: z.string().url().optional().nullable(),
  blob_url: z.string().url().optional().nullable(),
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

function isCompletedDuplicate(row: any) {
  return !!row && row.status === "posted" && Boolean(row.content_asset_id) && Boolean(row.content_queue_id);
}

export const Route = createFileRoute("/api/public/live-highlights")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedKey =
          process.env.CHATB2K_LIVE_INGEST_KEY ?? process.env.LIVE_HIGHLIGHTS_INGEST_KEY ?? null;
        const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];

        if (!expectedKey || !token || token !== expectedKey) {
          return unauthorized();
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return Response.json(
            { success: false, error: "Invalid JSON payload" },
            { status: 400 },
          );
        }

        const parsed = HighlightSchema.safeParse(payload);
        if (!parsed.success) {
          return Response.json(
            { success: false, error: "Invalid highlight payload", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        const h = parsed.data;
        const mediaUrl = h.blob_url ?? h.imagekit_url;
        if (!mediaUrl) {
          return Response.json(
            { success: false, error: "Live highlight requires a public media URL" },
            { status: 400 },
          );
        }

        const fingerprint = h.fingerprint ?? `${h.host_id}:${h.original_url}:${mediaUrl}`;
        const platforms = h.target_channels.length ? h.target_channels : ["tiktok", "youtube", "google_business"];
        const sourceAssetId = h.source_asset_id ?? fingerprint;

        const { data: existing, error: existingError } = await liveDb
          .from("resofit_live_highlights")
          .select("id,status,content_asset_id,content_queue_id,fingerprint")
          .eq("fingerprint", fingerprint)
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        if (isCompletedDuplicate(existing)) {
          return Response.json(
            {
              success: true,
              duplicate: true,
              message: "Highlight already ingested",
              data: existing,
            },
            { status: 200 },
          );
        }

        if (existing) {
          const { error: reopenError } = await liveDb
            .from("resofit_live_highlights")
            .update({
              status: "processing",
              error_message: null,
              processing_started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (reopenError) {
            throw reopenError;
          }
        }

        const { data: highlight, error: insertError } = existing
          ? { data: existing, error: null }
          : await liveDb
              .from("resofit_live_highlights")
              .insert({
                host_id: h.host_id,
                host_name: h.host_name ?? null,
                original_url: h.original_url,
                imagekit_url: mediaUrl,
                title: h.title ?? null,
                caption: h.caption ?? null,
                target_channels: h.target_channels,
                fingerprint,
                source_asset_id: sourceAssetId,
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
          const meta = (h.metadata ?? {}) as Record<string, unknown>;
          const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
          const width = num(meta.width);
          const height = num(meta.height);
          const duration_seconds = num(meta.duration_seconds);
          const aspect_ratio = num(meta.aspect_ratio) ?? (width && height ? width / height : null);

          const assetPayload = {
            source_provider: "bigo_live",
            source_asset_id: sourceAssetId,
            source_url: h.original_url,
            canonical_url: mediaUrl,
            brand: "Resonance Fitness",
            campaign: "live_stream_highlights",
            asset_type: "video",
            mime_type: "video/mp4",
            width,
            height,
            duration_seconds,
            aspect_ratio,
            audio_present: typeof meta.audio_present === "boolean" ? meta.audio_present : null,
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
            .upsert(assetPayload, { onConflict: "source_provider,source_asset_id" })
            .select("id")
            .single();

          if (assetError || !asset) {
            throw assetError ?? new Error("Asset registration failed");
          }

          const queuePayload = {
            title: h.title ?? `ResoFit Live Highlight — ${h.host_name ?? h.host_id}`,
            asset_url: mediaUrl,
            public_id: sourceAssetId,
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
          };

          const { data: queue, error: queueError } = await supabaseAdmin
            .from("content_queue")
            .insert(queuePayload)
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
              error_message: null,
            })
            .eq("id", highlight.id);

          if (updateError) {
            throw updateError;
          }

          return Response.json(
            {
              success: true,
              duplicate: false,
              message: "Highlight ingested",
              data: {
                id: highlight.id,
                status: "posted",
                content_asset_id: asset.id,
                content_queue_id: queue.id,
              },
            },
            { status: 200 },
          );
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

          return Response.json(
            {
              success: false,
              error: "Live highlight was staged but canonical content registration failed",
              details: { message },
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
