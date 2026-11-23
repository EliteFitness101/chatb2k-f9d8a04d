import { createCipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const allowedMime = new Set(["video/mp4", "image/jpeg", "application/json"]);
const allowedClasses = new Set(["raw-captures", "processed", "google-business", "metadata", "logs"]);
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const BIGO_TOKEN_KEY="undefinedval0x01";
const BIGO_TOKEN_TIME_URL="https://sec.bigo.sg/v1/webjs/t";
const BIGO_TOKEN_STATUS_URL="https://sec.bigo.sg/v1/webjs/status";
const BIGO_ROOM_INFO_URL="https://ta.bigo.tv/official_website/studio/getInternalStudioInfo";
function parseBigoJsonp(text:string):Record<string,any>{const match=String(text).match(/^jsonp\w+\(([\s\S]+?)\);?\s*$/);if(!match)throw new Error("BIGO token endpoint returned invalid JSONP");return JSON.parse(match[1]);}
function encryptBigoPayload(payload:Record<string,unknown>):string{const salt=randomBytes(8);let digest=Buffer.alloc(0),previous=Buffer.alloc(0);while(digest.length<48){previous=createHash("md5").update(Buffer.concat([previous,Buffer.from(BIGO_TOKEN_KEY,"utf8"),salt])).digest();digest=Buffer.concat([digest,previous]);}const cipher=createCipheriv("aes-256-cbc",digest.subarray(0,32),digest.subarray(32,48));const encrypted=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload),"utf8")),cipher.final()]);return Buffer.concat([Buffer.from("Salted__","ascii"),salt,encrypted]).toString("base64");}
function bigoCallback():string{return "jsonpcallback_"+Date.now()+"_"+randomInt(0,1000001);}
async function fetchBigoJsonp(url:URL,cookie:string):Promise<Record<string,any>>{const response=await fetch(url,{headers:{"User-Agent":"python-requests/2.32.5","Accept":"*/*",...(cookie?{"Cookie":cookie}:{})},cache:"no-store",signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error("BIGO token endpoint HTTP "+response.status);return parseBigoJsonp(await response.text());}
async function resolveBigoRoom(hostId:string,cookie:string):Promise<{status:number;body:Record<string,unknown>}>{const region=process.env.VERCEL_REGION||"unknown";const timeUrl=new URL(BIGO_TOKEN_TIME_URL);timeUrl.searchParams.set("callback",bigoCallback());const timeData=await fetchBigoJsonp(timeUrl,cookie);if(!timeData.time)return {status:502,body:{ok:false,error:"BIGO_TOKEN_TIME_UNAVAILABLE",upstream_code:timeData.code??null,upstream_info:String(timeData.info||"").slice(0,80),region}};const payload={dr:randomBytes(16).toString("hex"),business:"bigolive-video",scene:"",at_time:timeData.time,ver:"2.0"};const statusUrl=new URL(BIGO_TOKEN_STATUS_URL);statusUrl.searchParams.set("callback",bigoCallback());statusUrl.searchParams.set("data",encryptBigoPayload(payload));const tokenData=await fetchBigoJsonp(statusUrl,cookie);const token=String(tokenData.token||"");if(!token)return {status:502,body:{ok:false,error:"BIGO_TOKEN_NOT_ISSUED",upstream_code:tokenData.code??null,upstream_info:String(tokenData.info||"").slice(0,80),region}};const roomUrl=new URL(BIGO_ROOM_INFO_URL);roomUrl.searchParams.set("siteId",hostId);roomUrl.searchParams.set("verify","");roomUrl.searchParams.set("token",token);const roomResponse=await fetch(roomUrl,{method:"POST",headers:{"User-Agent":"python-requests/2.32.5","Accept":"*/*",...(cookie?{"Cookie":cookie}:{})},cache:"no-store",signal:AbortSignal.timeout(15000)});if(!roomResponse.ok)throw new Error("BIGO room-info endpoint HTTP "+roomResponse.status);const roomPayload=await roomResponse.json();if(roomPayload.code!==0)return {status:502,body:{ok:false,error:"BIGO_ROOM_INFO_REJECTED",upstream_code:roomPayload.code??null,upstream_info:String(roomPayload.msg||"").slice(0,80),token_issued:true,region}};const data=roomPayload.data||{},hls=String(data.hls_src||"");if(hls&&!/^https:\/\//i.test(hls))throw new Error("BIGO returned a non-HTTPS HLS URL");return {status:200,body:{ok:true,token_issued:true,room_info_ok:true,alive:Boolean(hls),name:data.nick_name||data.clientBigoId||hostId,title:data.roomTopic||data.gameTitle||"BIGO Live Highlight",room_id:data.roomId||hostId,hls_src:hls,region}};}

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
        if (input.action === "bigo-room-info") {
          const hostId = typeof input.hostId === "string" ? input.hostId.trim() : "";
          const cookie = typeof input.cookieHeader === "string" ? input.cookieHeader.trim() : "";
          if (!/^[A-Za-z0-9_.-]{1,128}$/.test(hostId) || cookie.length > 8192 || /[\r\n]/.test(cookie)) {
            return json({ ok: false, error: "INVALID_BIGO_ROOM_REQUEST" }, 400);
          }
          const { data: source, error: sourceError } = await supabaseAdmin
            .from("bigo_sources")
            .select("bigo_id,display_name,active,capture_enabled")
            .eq("bigo_id", hostId)
            .eq("active", true)
            .eq("capture_enabled", true)
            .maybeSingle();
          if (sourceError) return json({ ok: false, error: "SOURCE_REGISTRY_LOOKUP_FAILED" }, 500);
          if (!source) return json({ ok: false, error: "HOST_NOT_ACTIVE_FOR_CAPTURE" }, 403);
          try {
            const result = await resolveBigoRoom(hostId, cookie);
            return json({ ...result.body, name: result.body.name || source.display_name || hostId }, result.status);
          } catch (error) {
            return json({
              ok: false, error: "BIGO_REGIONAL_RESOLUTION_FAILED",
              detail: String(error instanceof Error ? error.message : "BIGO resolution failed").slice(0, 160),
              region: process.env.VERCEL_REGION || "unknown",
            }, 502);
          }
        }
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
          const hostId = typeof input.hostId === "string" ? input.hostId.trim() : "";
          if (!name || name.length > 240 || name.includes("/") || name.includes("\\") ||
              !/^[A-Za-z0-9_.-]{1,128}$/.test(hostId) ||
              !allowedMime.has(mimeType) || !allowedClasses.has(archiveClass)) {
            return json({ error: "Invalid upload metadata" }, 400);
          }
          const resofitId = await ensureFolder(token, "ResoFit");
          const bigoId = await ensureFolder(token, "BIGO", resofitId);
          const hostsId = await ensureFolder(token, "hosts", bigoId);
          const hostFolderId = await ensureFolder(token, hostId, hostsId);
          let folderId: string;
          if (archiveClass === "google-business") {
            const processedFolderId = await ensureFolder(token, "processed", hostFolderId);
            folderId = await ensureFolder(token, "google-business", processedFolderId);
          } else {
            folderId = await ensureFolder(token, archiveClass, hostFolderId);
          }
          const session = await driveRequest(token,
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,size,md5Checksum,parents",
            { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": mimeType },
              body: JSON.stringify({ name, mimeType, parents: [folderId] }) });
          const uploadUrl = session.headers.get("location");
          if (!session.ok || !uploadUrl?.startsWith("https://www.googleapis.com/upload/drive/")) {
            return json({ error: `Drive upload session failed (${session.status})` }, 502);
          }
          return json({ uploadUrl, archivePath: archiveClass === "google-business" ? `ResoFit/BIGO/hosts/${hostId}/processed/google-business/` : `ResoFit/BIGO/hosts/${hostId}/${archiveClass}/` });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Drive archive request failed";
          console.error("BIGO Drive archive endpoint failed", { message });
          return json({ error: message }, 503);
        }
      },
    },
  },
});
