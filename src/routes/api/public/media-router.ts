import { createFileRoute } from "@tanstack/react-router";
import { resolveMediaProvider, listMediaProviderRoutes, listMediaProviderRouteCatalog, recommendMediaProvider, recordMediaPipelineEvent } from "@/lib/media/media-pipeline-router.server";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(request: Request) {
  const expected = process.env.CHATB2K_LIVE_INGEST_KEY;
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return Boolean(expected && token && token === expected);
}

export const Route = createFileRoute("/api/public/media-router")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return json({ ok: false, error: "Unauthorized" }, 401);
        try {
          const [routes, catalog] = await Promise.all([
            listMediaProviderRoutes(),
            listMediaProviderRouteCatalog(),
          ]);
          return json({
            ok: true,
            router: "ChatB2K Media Pipeline Router",
            mode: "database_registry",
            routes: routes.map((r) => ({
              route_id: r.route_id,
              provider: r.provider,
              service_type: r.service_type,
              endpoint_class: r.endpoint_class,
              status: r.status,
              priority: Number(r.config.priority ?? 100),
              supports_video: Boolean(r.config.supports_video),
              preserve_existing_usage: Boolean(r.config.preserve_existing_usage),
              fallback_provider: r.fallback_provider,
            })),
            route_catalog: catalog.map((r) => ({
              route_id: r.route_id,
              provider: r.provider,
              service_type: r.service_type,
              endpoint_class: r.endpoint_class,
              status: r.status,
              priority: Number(r.config.priority ?? 100),
              fallback_provider: r.fallback_provider,
              runtime_verified: r.status === "healthy" || r.config.runtime_verified === true,
              route_eligible_for_resolution: ["declared_production", "active", "healthy"].includes(r.status) && Array.isArray(r.config.allowed_host_suffixes),
              custom_host: r.config.custom_host ?? r.config.custom_cdn_host ?? null,
              dns_status: r.config.dns_status ?? r.config.custom_cdn_status ?? null,
              bucket_binding_status: r.config.bucket_binding_status ?? null,
              activation_gate: Array.isArray(r.config.activation_gate) ? r.config.activation_gate : [],
            })),
            supported_purposes: [
              "catalog_metadata", "private_paid_delivery", "public_product_media",
              "educational_thumbnails", "approved_promo_media", "live_stream_highlights",
              "bigo_archive", "transform_public_media",
            ],
            write_actions_enabled: false,
            publish_actions_enabled: false,
          });
        } catch {
          return json({ ok: false, error: "Media provider registry unavailable" }, 503);
        }
      },
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ ok: false, error: "Unauthorized" }, 401);
        const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid JSON", request_id: requestId }, 400);
        }
        const action = String(body.action ?? "resolve");
        if (action === "recommend") {
          const purpose = String(body.purpose ?? "");
          try {
            const recommendation = await recommendMediaProvider(purpose);
            if (!recommendation) {
              return json({
                ok: false,
                request_id: requestId,
                error: "Unsupported media purpose",
                allowed_purposes: [
                  "catalog_metadata", "private_paid_delivery", "public_product_media",
                  "educational_thumbnails", "approved_promo_media", "live_stream_highlights",
                  "bigo_archive", "transform_public_media",
                ],
              }, 400);
            }
            await recordMediaPipelineEvent({
              requestId,
              action: "api_recommend",
              provider: typeof recommendation.provider === "string" ? recommendation.provider : undefined,
              routeId: typeof recommendation.route_id === "string" ? recommendation.route_id : undefined,
              outcome: "recommendation_only",
              metadata: { purpose, operation_ready: recommendation.operation_ready ?? false },
            });
            return json({
              ok: true,
              request_id: requestId,
              mode: "recommendation_only",
              recommendation,
              write_actions_enabled: false,
              publish_actions_enabled: false,
            });
          } catch {
            return json({ ok: false, request_id: requestId, error: "Media provider registry unavailable" }, 503);
          }
        }
        if (action !== "resolve") return json({ ok: false, error: "Unsupported action", allowed_actions: ["resolve", "recommend"] }, 400);
        const urls = Array.isArray(body.urls) ? body.urls.filter((v): v is string => typeof v === "string").slice(0, 20) : [];
        const candidates = urls.map((url) => ({ url }));
        if (!candidates.length) return json({ ok: false, error: "Provide 1–20 candidate HTTPS media URLs" }, 400);
        try {
          const resolved = await resolveMediaProvider(candidates, requestId);
          if (!resolved) return json({ ok: false, request_id: requestId, error: "No active registry route accepts these URLs" }, 422);
          await recordMediaPipelineEvent({ requestId, action: "api_resolve", provider: resolved.provider, routeId: resolved.route_id, outcome: "success", assetHost: resolved.host });
          return json({ ok: true, request_id: requestId, route: resolved });
        } catch {
          return json({ ok: false, request_id: requestId, error: "Media provider registry unavailable" }, 503);
        }
      },
    },
  },
});
