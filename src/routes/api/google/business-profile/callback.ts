import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CALLBACK_URI =
  process.env.GOOGLE_BUSINESS_PROFILE_REDIRECT_URI ??
  "https://chatb2k.resofit.fit/api/google/business-profile/callback";
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_DRIVE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const REQUIRED_SCOPE = "https://www.googleapis.com/auth/business.manage";

export const Route = createFileRoute("/api/google/business-profile/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (url.searchParams.get("error")) {
          return new Response("Google Business Profile authorization was cancelled or denied.", { status: 400 });
        }
        if (!code || !state) {
          return new Response("Missing OAuth code or state.", { status: 400 });
        }

        const cookieHeader = request.headers.get("cookie") ?? "";
        const stateCookie = cookieHeader
          .split(";")
          .map((cookie) => cookie.trim())
          .find((cookie) => cookie.startsWith("google_business_oauth_state="));
        const expectedState = stateCookie
          ? decodeURIComponent(stateCookie.slice("google_business_oauth_state=".length))
          : null;

        if (!expectedState || expectedState !== state) {
          return new Response("Invalid Google Business Profile OAuth state.", { status: 403 });
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
          console.error("Google Business Profile token exchange failed", { status: tokenResponse.status });
          return new Response("Google Business Profile token exchange failed.", { status: 502 });
        }

        const tokens = await tokenResponse.json();
        const refreshToken =
          typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0
            ? tokens.refresh_token
            : null;
        const scopes =
          typeof tokens.scope === "string" ? tokens.scope.split(/\s+/).filter(Boolean) : [];

        if (!refreshToken) {
          return new Response(
            "Google did not issue a new refresh token. Reconnect this Business Profile authorization with consent; the existing Google Drive credential was not changed.",
            { status: 502 },
          );
        }
        if (!scopes.includes(REQUIRED_SCOPE)) {
          return new Response(
            "Google did not grant the required business.manage scope. No Business Profile credential was stored.",
            { status: 403 },
          );
        }

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
          console.error("Google Business Profile refresh-token verification failed", { status: refreshResponse.status });
          return new Response("Business Profile refresh-token verification failed.", { status: 502 });
        }
        const refreshed = await refreshResponse.json();
        if (!refreshed.access_token) {
          return new Response("Google did not return a refreshed access token.", { status: 502 });
        }

        const [profileResponse, accountsResponse] = await Promise.all([
          fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${refreshed.access_token}` },
          }),
          fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
            headers: { Authorization: `Bearer ${refreshed.access_token}` },
          }),
        ]);

        if (!profileResponse.ok) {
          return new Response("Could not verify the authorized Google account.", { status: 502 });
        }
        const profile = await profileResponse.json();
        if (typeof profile.email !== "string" || !profile.email) {
          return new Response("Google did not return the authorized account email.", { status: 502 });
        }
        if (!accountsResponse.ok) {
          console.error("Google Business Profile accounts API probe failed", { status: accountsResponse.status });
          return new Response(
            "OAuth succeeded, but the Business Profile API is not accessible for this account. Check API access and enabled APIs; no connection success was recorded.",
            { status: 502 },
          );
        }

        const accountPayload = await accountsResponse.json();
        const accounts = Array.isArray(accountPayload.accounts) ? accountPayload.accounts : [];
        const { error: persistError } = await (supabaseAdmin as any)
          .from("google_oauth_credentials")
          .upsert(
            {
              provider: "google_business_profile",
              refresh_token: refreshToken,
              scopes,
              token_type: tokens.token_type ?? "Bearer",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "provider" },
          );

        if (persistError) {
          console.error("Google Business Profile credential persistence failed", { message: persistError.message });
          return new Response("Could not securely store the Business Profile credential.", { status: 500 });
        }

        return new Response(
          `Google Business Profile connected and verified for ${profile.email}. Account API responded successfully; ${accounts.length} account(s) returned. Existing Google Drive credentials were left unchanged.`,
          {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
              "Set-Cookie": "google_business_oauth_state=; Max-Age=0; Path=/api/google/business-profile; HttpOnly; Secure; SameSite=Lax",
            },
          },
        );
      },
    },
  },
});
