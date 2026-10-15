import { createFileRoute } from "@tanstack/react-router";
import { resolveMediaProvider, listMediaProviderRoutes, recordMediaPipelineEvent } from "@/lib/media/media-pipeline-router.server";

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
          const routes = await listMediaProviderRoutes();
          return json({
            ok: true,
            router: "ChatB2K Media Pipeline Router",
            mode: "database_registry",
            routes: routes.map((r) => ({
              route_id: r.route_id,
              provider: r.provider,
              status: r.status,
              priority: Number(r.config.priority ?? 100),
              supports_video: Boolean(r.config.supports_video),
              preserve_existing_usage: Boolean(r.config.preserve_existing_usage),
            })),
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
        if (action !== "resolve") return json({ ok: false, error: "Unsupported action", allowed_actions: ["resolve"] }, 400);
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
