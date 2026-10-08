import { createFileRoute } from "@tanstack/react-router";

const CALLBACK_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ??
  "https://chatb2k.resofit.fit/api/google/drive-mcp/callback";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];

export const Route = createFileRoute("/api/google/drive-mcp/start")({
  server: {
    handlers: {
      GET: async () => {
        if (!GOOGLE_CLIENT_ID) {
          return new Response("Google OAuth is not configured", { status: 503 });
        }

        const configuredScopes =
          process.env.GOOGLE_OAUTH_SCOPES
            ?.split(/\s+/)
            .map((scope) => scope.trim())
            .filter(Boolean) ?? [];

        const scopes = configuredScopes.length ? configuredScopes : DEFAULT_SCOPES;

        const stateBytes = crypto.getRandomValues(new Uint8Array(32));
        const state = Array.from(stateBytes, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");

        const params = new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          redirect_uri: CALLBACK_URI,
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          state,
          scope: scopes.join(" "),
        });

        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
            "Set-Cookie": `google_oauth_state=${state}; Max-Age=600; Path=/api/google/drive-mcp; HttpOnly; Secure; SameSite=Lax`,
          },
        });
      },
    },
  },
});
