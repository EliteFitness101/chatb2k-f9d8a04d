import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_DRIVE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const Route = createFileRoute("/api/google/drive-mcp/access-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const callerKey = authorization.replace(/^Bearer\\s+/i, "");
        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
        if (!callerKey || !supabaseUrl) {
          return Response.json({ ok: false, error: "Unauthorized" }, {
            status: 401,
            headers: { "Cache-Control": "no-store" },
          });
        }
        // Validate the caller key against the project's admin endpoint rather than comparing
        // it to a possibly stale duplicate environment variable in Vercel.
        const keyCheck = await fetch(`${supabaseUrl.replace(/\\/$/, "")}/auth/v1/admin/users?per_page=1`, {
          headers: { apikey: callerKey, Authorization: `Bearer ${callerKey}` },
          cache: "no-store",
        }).catch(() => null);
        if (!keyCheck?.ok) {
          return Response.json({ ok: false, error: "Unauthorized" }, {
            status: 401,
            headers: { "Cache-Control": "no-store" },
          });
        }

        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
          return Response.json({ ok: false, error: "Google OAuth client credentials are not configured" }, {
            status: 503,
            headers: { "Cache-Control": "no-store" },
          });
        }

        try {
          const { data, error } = await (supabaseAdmin as any)
            .from("google_oauth_credentials")
            .select("refresh_token")
            .eq("provider", "google_drive")
            .maybeSingle();

          if (error) throw new Error("Stored Google Drive credential lookup failed");
          const refreshToken =
            data?.refresh_token ??
            process.env.GOOGLE_DRIVE_REFRESH_TOKEN ??
            process.env.GOOGLE_REFRESH_TOKEN ??
            "";

          if (!refreshToken) {
            return Response.json({ ok: false, error: "Google Drive refresh token is not stored" }, {
              status: 503,
              headers: { "Cache-Control": "no-store" },
            });
          }

          const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: GOOGLE_CLIENT_ID,
              client_secret: GOOGLE_CLIENT_SECRET,
              refresh_token: refreshToken,
              grant_type: "refresh_token",
            }),
          });
          const tokens = await tokenResponse.json().catch(() => ({}));

          if (!tokenResponse.ok || !tokens.access_token) {
            console.error("Google Drive token refresh failed", {
              status: tokenResponse.status,
              error: tokens.error ?? "token_response_missing_access_token",
            });
            return Response.json({ ok: false, error: "Google Drive token refresh failed" }, {
              status: 502,
              headers: { "Cache-Control": "no-store" },
            });
          }

          return Response.json({
            ok: true,
            access_token: tokens.access_token,
            token_type: tokens.token_type ?? "Bearer",
            expires_in: tokens.expires_in ?? null,
          }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          console.error("Google Drive access-token proxy failed", {
            message: error instanceof Error ? error.message : "unknown_error",
          });
          return Response.json({ ok: false, error: "Google Drive token service failed" }, {
            status: 500,
            headers: { "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
