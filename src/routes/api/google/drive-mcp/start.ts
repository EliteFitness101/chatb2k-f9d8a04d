import { createFileRoute } from "@tanstack/react-router";

const CALLBACK_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ??
  "https://chatb2k.resofit.fit/api/google/drive-mcp/callback";
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_DRIVE_CLIENT_ID;

// Explicitly request the 40 Google OAuth scopes already recorded for the
// ResoFit Google connection. Keep this list in sync with the credential audit.
// These permissions are broad; review and reduce them if the integration's
// requirements change. No credentials are stored in this source file.
const RESOFIT_GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/devstorage.read_only",
  "https://www.googleapis.com/auth/drive.apps.readonly",
  "https://www.googleapis.com/auth/script.deployments",
  "https://www.googleapis.com/auth/display-video-mediaplanning",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/authorized-buyers-marketplace",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/webmasters",
  "openid",
  "https://www.googleapis.com/auth/drive.install",
  "https://www.googleapis.com/auth/cloud-billing",
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/doubleclickbidmanager",
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/analytics",
  "https://www.googleapis.com/auth/forms.body.readonly",
  "https://www.googleapis.com/auth/script.processes",
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/forms.currentonly",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/script.metrics",
  "https://www.googleapis.com/auth/script.projects.readonly",
  "https://www.googleapis.com/auth/siteverification.verify_only",
  "https://www.googleapis.com/auth/ediscovery.readonly",
  "https://www.googleapis.com/auth/cloud-billing.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.apps",
  "https://www.googleapis.com/auth/books",
  "https://www.googleapis.com/auth/ediscovery",
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.photos.readonly",
  "https://www.googleapis.com/auth/script.deployments.readonly",
  "https://www.googleapis.com/auth/forms",
  "https://www.googleapis.com/auth/drive.scripts",
] as const;

export const Route = createFileRoute("/api/google/drive-mcp/start")({
  server: {
    handlers: {
      GET: async () => {
        if (!GOOGLE_CLIENT_ID) {
          return new Response("Google OAuth is not configured", { status: 503 });
        }

        const scopes = RESOFIT_GOOGLE_OAUTH_SCOPES;

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
