import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CALLBACK_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ??
  "https://chatb2k.resofit.fit/api/google/drive-mcp/callback";
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_DRIVE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_DRIVE_CLIENT_SECRET;

export const Route = createFileRoute("/api/google/drive-mcp/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return new Response("Google OAuth authorization failed.", { status: 400 });
        }
        if (!code || !state) {
          return new Response("Missing OAuth code or state.", { status: 400 });
        }

        const cookieHeader = request.headers.get("cookie") ?? "";
        const stateCookie = cookieHeader
          .split(";")
          .map((cookie) => cookie.trim())
          .find((cookie) => cookie.startsWith("google_oauth_state="));
        const expectedState = stateCookie
          ? decodeURIComponent(stateCookie.slice("google_oauth_state=".length))
          : null;

        if (!expectedState || expectedState !== state) {
          return new Response("Invalid OAuth state.", { status: 403 });
        }
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
          return new Response("Google OAuth is not configured.", { status: 503 });
        }

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: CALLBACK_URI,
          }),
        });

        if (!tokenResponse.ok) {
          console.error("Google OAuth token exchange failed", {
            status: tokenResponse.status,
          });
          return new Response("Google OAuth token exchange failed.", { status: 502 });
        }

        const tokens = await tokenResponse.json();
        if (!tokens.access_token) {
          return new Response("Google OAuth did not return an access token.", {
            status: 502,
          });
        }

        const scopes =
          typeof tokens.scope === "string"
            ? tokens.scope.split(/\s+/).filter(Boolean)
            : [];
        let refreshToken =
          typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0
            ? tokens.refresh_token
            : null;

        if (!refreshToken) {
          const { data, error: readError } = await (supabaseAdmin as any)
            .from("google_oauth_credentials")
            .select("refresh_token")
            .eq("provider", "google_drive")
            .maybeSingle();

          if (readError) {
            console.error("Google OAuth stored credential lookup failed", {
              message: readError.message,
            });
            return new Response("Could not verify stored Google Drive credentials.", {
              status: 500,
            });
          }

          refreshToken =
            data?.refresh_token ??
            process.env.GOOGLE_DRIVE_REFRESH_TOKEN ??
            process.env.GOOGLE_REFRESH_TOKEN ??
            null;
        }

        if (!refreshToken) {
          return new Response(
            "Google did not return a refresh token and no stored credential is available. Reconnect Google Drive with consent.",
            { status: 502 },
          );
        }

        const { error: persistError } = await (supabaseAdmin as any)
          .from("google_oauth_credentials")
          .upsert(
            {
              provider: "google_drive",
              refresh_token: refreshToken,
              scopes,
              token_type: tokens.token_type ?? "Bearer",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "provider" },
          );

        if (persistError) {
          console.error("Google OAuth credential persistence failed", {
            message: persistError.message,
          });
          return new Response("Could not securely store Google Drive credentials.", {
            status: 500,
          });
        }

        // Prove the stored refresh token can be reused without another consent flow.
        const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });

        if (!refreshResponse.ok) {
          console.error("Google OAuth refresh-token verification failed", {
            status: refreshResponse.status,
          });
          return new Response(
            "Google Drive credentials were stored, but refresh-token verification failed.",
            { status: 502 },
          );
        }

        const refreshedTokens = await refreshResponse.json();
        if (!refreshedTokens.access_token) {
          return new Response("Google did not return a refreshed access token.", {
            status: 502,
          });
        }

        const driveProbe = await fetch(
          "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name)",
          { headers: { Authorization: `Bearer ${refreshedTokens.access_token}` } },
        );

        if (!driveProbe.ok) {
          console.error("Google Drive API verification failed", {
            status: driveProbe.status,
          });
          return new Response(
            "Credentials were stored and refreshed, but the Google Drive API check failed.",
            { status: 502 },
          );
        }

        console.log("Google Drive OAuth credentials persisted and verified", {
          provider: "google_drive",
          has_refresh_token: true,
          refresh_token_reused: true,
          drive_api_status: driveProbe.status,
          scope_count: scopes.length,
        });

        return new Response(
          `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Google Drive Connected</title></head>
  <body>
    <h1>Google Drive connected</h1>
    <p>Authorization completed, credentials stored securely, and a server-side Drive API check passed.</p>
    <p>You can close this window.</p>
  </body>
</html>`,
          {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
              "Set-Cookie":
                "google_oauth_state=; Max-Age=0; Path=/api/google/drive-mcp; HttpOnly; Secure; SameSite=Lax",
            },
          },
        );
      },
    },
  },
});
