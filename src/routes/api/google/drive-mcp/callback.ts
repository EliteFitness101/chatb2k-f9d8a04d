import { createFileRoute } from "@tanstack/react-router";
const CALLBACK_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ??
  "https://chatb2k.resofit.fit/api/google/drive-mcp/callback";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const Route = createFileRoute("/api/google/drive-mcp/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) {
          return new Response(
            `Google OAuth authorization failed: ${error}`,
            { status: 400 },
          );
        }
        if (!code || !state) {
          return new Response(
            "Missing OAuth code or state.",
            { status: 400 },
          );
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
          return new Response(
            "Invalid OAuth state.",
            { status: 403 },
          );
        }
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
          return new Response(
            "Google OAuth is not configured.",
            { status: 503 },
          );
        }
        const tokenResponse = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: GOOGLE_CLIENT_ID,
              client_secret: GOOGLE_CLIENT_SECRET,
              code,
              grant_type: "authorization_code",
              redirect_uri: CALLBACK_URI,
            }),
          },
        );
        if (!tokenResponse.ok) {
          const details = await tokenResponse.text();
          console.error("Google OAuth token exchange failed", {
            status: tokenResponse.status,
            details,
          });
          return new Response(
            "Google OAuth token exchange failed.",
            { status: 502 },
          );
        }
        const tokens = await tokenResponse.json();
        if (!tokens.access_token) {
          return new Response(
            "Google OAuth did not return an access token.",
            { status: 502 },
          );
        }
        // Do not expose access_token or refresh_token to the browser.
        // The refresh token should remain server-side in Vercel env/storage.
        console.log("Google Drive OAuth authorization completed", {
          token_type: tokens.token_type,
          scope: tokens.scope,
          expires_in: tokens.expires_in,
          has_refresh_token: Boolean(tokens.refresh_token),
        });
        return new Response(
          `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Google Drive Connected</title>
  </head>
  <body>
    <h1>Google Drive connected</h1>
    <p>Authorization completed successfully.</p>
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
