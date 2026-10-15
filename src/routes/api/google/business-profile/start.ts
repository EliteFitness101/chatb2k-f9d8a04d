import { createFileRoute } from "@tanstack/react-router";

const CALLBACK_URI =
  process.env.GOOGLE_BUSINESS_PROFILE_REDIRECT_URI ??
  "https://chatb2k.resofit.fit/api/google/business-profile/callback";
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_DRIVE_CLIENT_ID;

export const Route = createFileRoute("/api/google/business-profile/start")({
  server: {
    handlers: {
      GET: async () => {
        if (!GOOGLE_CLIENT_ID) {
          return new Response("Google OAuth is not configured", { status: 503 });
        }

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
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/business.manage",
          ].join(" "),
        });

        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
            "Set-Cookie": `google_business_oauth_state=${state}; Max-Age=600; Path=/api/google/business-profile; HttpOnly; Secure; SameSite=Lax`,
          },
        });
      },
    },
  },
});
