import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const allowedMime = new Set(["video/mp4", "image/jpeg", "application/json"]);
const allowedClasses = new Set(["raw-captures", "processed", "metadata", "logs"]);
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function driveAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Drive OAuth unavailable");
  const { data, error } = await (supabaseAdmin as any)
    .from("google_oauth_credentials").select("refresh_token")
    .eq("provider", "google_drive").maybeSingle();
  if (error) throw new Error("Stored Google Drive credential lookup failed");
  const refreshToken = data?.refresh_token ??
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? process.env.GOOGLE_REFRESH_TOKEN ?? "";
  if (!refreshToken) throw new Error("Google Drive refresh token unavailable");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error("Google Drive token refresh failed");
  const token = await tokenResponse.json();
  if (!token.access_token) throw new Error("Google Drive access token missing");
  return String(token.access_token);
}

async function driveRequest(token: string, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers, cache: "no-store" });
}

async function ensureFolder(token: string, name: string, parentId?: string) {
  const qParts = [
    `name='${name.replace(/'/g, "\\'")}'`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
  ];
  if (parentId) qParts.push(`'${parentId}' in parents`);
  const q = encodeURIComponent(qParts.join(" and "));
  const lookup = await driveRequest(token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=100&fields=files(id,name,mimeType,parents)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  const found = await lookup.json().catch(() => ({}));
  if (!lookup.ok) throw new Error(`Drive folder lookup failed (${lookup.status})`);
  const existing = (found.files ?? []).find((f: any) => f.name === name && (!parentId || f.parents?.includes(parentId)));
  if (existing?.id) return String(existing.id);
  const create = await driveRequest(token,
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) }) });
  const made = await create.json().catch(() => ({}));
  if (!create.ok || !made.id) throw new Error(`Drive folder creation failed (${create.status})`);
  return String(made.id);
}

export const Route = createFileRoute("/api/google/drive-mcp/bigo-upload-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CHATB2K_LIVE_INGEST_KEY;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return json({ error: "Unauthorized" }, 401);
        }
        const input = await request.json().catch(() => null);
        if (!input || typeof input !== "object") return json({ error: "Invalid request body" }, 400);
        try {
          const token = await driveAccessToken();
          if (input.action === "verify") {
            const fileId = typeof input.fileId === "string" ? input.fileId : "";
            const expectedSize = Number(input.expectedSize);
            const expectedMd5 = typeof input.expectedMd5 === "string" ? input.expectedMd5.toLowerCase() : "";
            if (!fileId || !Number.isSafeInteger(expectedSize) || expectedSize < 0 || !/^[a-f0-9]{32}$/.test(expectedMd5)) {
              return json({ error: "Invalid verification request" }, 400);
            }
            const response = await driveRequest(token,
              `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,size,md5Checksum,webViewLink,parents&supportsAllDrives=true`);
            const file = await response.json().catch(() => ({}));
            if (!response.ok) return json({ error: `Drive metadata read-back failed (${response.status})` }, 502);
            const checksumVerified = Number(file.size) === expectedSize &&
              String(file.md5Checksum ?? "").toLowerCase() === expectedMd5;
            if (!checksumVerified) return json({ error: "Drive size or MD5 read-back mismatch", fileId }, 409);
            return json({ fileId: file.id, name: file.name, size: Number(file.size),
              md5Checksum: file.md5Checksum, webViewLink: file.webViewLink ?? "",
              checksumVerified: true });
          }
          if (input.action !== "session") return json({ error: "Unsupported action" }, 400);
          const name = typeof input.name === "string" ? input.name.trim() : "";
          const mimeType = typeof input.mimeType === "string" ? input.mimeType : "";
          const archiveClass = typeof input.archiveClass === "string" ? input.archiveClass : "";
          if (!name || name.length > 240 || name.includes("/") || name.includes("\\") ||
              !allowedMime.has(mimeType) || !allowedClasses.has(archiveClass)) {
            return json({ error: "Invalid upload metadata" }, 400);
          }
          const resofitId = await ensureFolder(token, "ResoFit");
          const bigoId = await ensureFolder(token, "BIGO", resofitId);
          for (const folderName of allowedClasses) await ensureFolder(token, folderName, bigoId);
          const folderId = await ensureFolder(token, archiveClass, bigoId);
          const session = await driveRequest(token,
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,size,md5Checksum,parents",
            { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": mimeType },
              body: JSON.stringify({ name, mimeType, parents: [folderId] }) });
          const uploadUrl = session.headers.get("location");
          if (!session.ok || !uploadUrl?.startsWith("https://www.googleapis.com/upload/drive/")) {
            return json({ error: `Drive upload session failed (${session.status})` }, 502);
          }
          return json({ uploadUrl, archivePath: `ResoFit/BIGO/${archiveClass}/` });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Drive archive request failed";
          console.error("BIGO Drive archive endpoint failed", { message });
          return json({ error: message }, 503);
        }
      },
    },
  },
});
