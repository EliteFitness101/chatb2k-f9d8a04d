import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/google/drive-mcp/bigo-upload-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CHATB2K_LIVE_INGEST_KEY;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const input = await request.json().catch(() => null);
        const name = typeof input?.name === "string" ? input.name.trim() : "";
        const mimeType = typeof input?.mimeType === "string" ? input.mimeType : "";
        if (!name || name.length > 240 || !["video/mp4", "image/jpeg", "application/json"].includes(mimeType)) {
          return Response.json({ error: "Invalid upload metadata" }, { status: 400 });
        }
        const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_DRIVE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_DRIVE_CLIENT_SECRET;
        if (!clientId || !clientSecret) return Response.json({ error: "Drive OAuth unavailable" }, { status: 503 });
        const { data, error } = await (supabaseAdmin as any).from("google_oauth_credentials")
          .select("refresh_token").eq("provider", "google_drive").maybeSingle();
        if (error || !data?.refresh_token) return Response.json({ error: "Drive credential unavailable" }, { status: 503 });
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: data.refresh_token, grant_type: "refresh_token" }),
        });
        if (!tokenRes.ok) return Response.json({ error: "Drive token refresh failed" }, { status: 502 });
        const token = await tokenRes.json();
        if (!token.access_token) return Response.json({ error: "No Drive access token" }, { status: 502 });
        const q = encodeURIComponent("name='BIGO Highlights Archive' and mimeType='application/vnd.google-apps.folder' and trashed=false");
        const lookup = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1&fields=files(id)`, {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (!lookup.ok) return Response.json({ error: "Drive archive lookup failed" }, { status: 502 });
        const folders = await lookup.json();
        let folderId = folders.files?.[0]?.id;
        if (!folderId) {
          const created = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
            method: "POST",
            headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: "BIGO Highlights Archive", mimeType: "application/vnd.google-apps.folder" }),
          });
          if (!created.ok) return Response.json({ error: "Drive archive folder creation failed" }, { status: 502 });
          folderId = (await created.json()).id;
        }
        const session = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink", {
          method: "POST",
          headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType },
          body: JSON.stringify({ name, mimeType, parents: [folderId] }),
        });
        const uploadUrl = session.headers.get("location");
        if (!session.ok || !uploadUrl?.startsWith("https://www.googleapis.com/upload/drive/")) {
          return Response.json({ error: "Drive upload session failed" }, { status: 502 });
        }
        return Response.json({ uploadUrl, archiveFolder: "BIGO Highlights Archive" }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
