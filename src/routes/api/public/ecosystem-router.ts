import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(request: Request) {
  const expected = process.env.CHATB2K_LIVE_INGEST_KEY;
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return Boolean(expected && token && token === expected);
}

export const Route = createFileRoute("/api/public/ecosystem-router")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ ok: false, error: "Unauthorized" }, 401);
        const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid JSON", request_id: requestId }, 400);
        }

        const routeId = String(body.route_id ?? "");
        const action = String(body.action ?? "");
        const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
          ? body.payload as Record<string, unknown>
          : {};
        if (!routeId || !action) return json({ ok: false, error: "route_id and action are required", request_id: requestId }, 400);

        const { data: route, error } = await (supabaseAdmin as any)
          .from("chatb2k_provider_routes")
          .select("route_id,provider,service_type,status,config")
          .eq("route_id", routeId)
          .maybeSingle();
        if (error || !route) return json({ ok: false, error: "Route not registered", request_id: requestId }, 404);
        if (!["declared_production", "active", "healthy"].includes(String(route.status))) {
          return json({ ok: false, error: "Route is not enabled", request_id: requestId }, 409);
        }

        const config = route.config as Record<string, unknown>;
        const allowedActions = Array.isArray(config.allowed_actions) ? config.allowed_actions.map(String) : [];
        if (!allowedActions.includes(action)) {
          return json({ ok: false, error: "Action is not allowed for this route", request_id: requestId }, 403);
        }

        const baseUrlEnv = String(config.base_url_env ?? "");
        const authKeyEnv = String(config.auth_key_env ?? "");
        const path = String(config.path ?? "");
        const method = String(config.method ?? "POST").toUpperCase();
        const timeoutMs = Math.min(30000, Math.max(1000, Number(config.timeout_ms ?? 15000)));
        if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(baseUrlEnv) || !/^[A-Z][A-Z0-9_]{1,127}$/.test(authKeyEnv)) {
          return json({ ok: false, error: "Route secret references are invalid", request_id: requestId }, 503);
        }
        if (!/^\/functions\/v1\/[a-z0-9-]+$/.test(path) || method !== "POST") {
          return json({ ok: false, error: "Route target is not an approved Edge Function path", request_id: requestId }, 503);
        }
        const baseUrl = process.env[baseUrlEnv];
        const providerKey = process.env[authKeyEnv];
        if (!baseUrl || !providerKey) {
          return json({ ok: false, error: "Configured provider credentials are unavailable", provider: route.provider, request_id: requestId }, 503);
        }

        let target: URL;
        try {
          target = new URL(path, baseUrl);
          if (target.protocol !== "https:" || target.origin !== new URL(baseUrl).origin) throw new Error("invalid_target");
        } catch {
          return json({ ok: false, error: "Configured provider target is invalid", request_id: requestId }, 503);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const upstream = await fetch(target, {
            method,
            headers: {
              Authorization: `Bearer ${providerKey}`,
              apikey: providerKey,
              "Content-Type": "application/json",
              "x-request-id": requestId,
            },
            body: JSON.stringify({ ...payload, action }),
            signal: controller.signal,
            cache: "no-store",
          });
          const raw = await upstream.text();
          let result: unknown;
          try { result = JSON.parse(raw); } catch { result = { response_text: raw.slice(0, 1000) }; }
          return json({
            ok: upstream.ok,
            request_id: requestId,
            route: { route_id: route.route_id, provider: route.provider, service_type: route.service_type },
            upstream_status: upstream.status,
            result,
          }, upstream.ok ? 200 : 502);
        } catch (error) {
          const timedOut = error instanceof Error && error.name === "AbortError";
          return json({ ok: false, request_id: requestId, error: timedOut ? "Provider timeout" : "Provider request failed", provider: route.provider }, 502);
        } finally {
          clearTimeout(timeout);
        }
      },
    },
  },
});
