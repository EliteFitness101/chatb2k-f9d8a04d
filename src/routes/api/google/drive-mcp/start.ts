import { createFileRoute } from "@tanstack/react-router";

const CALLBACK_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ??
  "https://chatb2k.resofit.fit/api/google/drive-mcp/callback";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

export const Route = createFileRoute("/api/google/drive-mcp/start")({
  server: {
    handlers: {
      GET: async () => {
        if (!GOOGLE_CLIENT_ID) {
          return new Response("Google OAuth is not configured", { status: 503 });
        }

        const scopes = [
          "https://www.googleapis.com/auth/drive.file",
          "https://www.googleapis.com/auth/drive.readonly",
        ];

        const params = new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          redirect_uri: CALLBACK_URI,
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          scope: scopes.join(" "),
        });

        return Response.redirect(
          `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
          302,
        );
      },
    },
  },
});
