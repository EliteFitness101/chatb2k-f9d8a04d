import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "resofit-social-media";
const db = createClient(SUPABASE_URL, SERVICE_ROLE);

function out(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
function same(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function expectedSecret() {
  const env = Deno.env.get("BUFFER_CRON_SECRET") || "";
  if (env) return env;
  const { data, error } = await db.rpc("get_buffer_cron_secret");
  if (error || !data) throw new Error("Buffer cron secret unavailable");
  return String(data);
}
function allowedDropbox(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      (u.hostname === "www.dropbox.com" || u.hostname === "dl.dropboxusercontent.com") &&
      /^\/scl\/fi\/[A-Za-z0-9_-]+\/[^/]+$/.test(u.pathname) &&
      Boolean(u.searchParams.get("rlkey")) &&
      u.searchParams.get("dl") === "1";
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return out({ error: "POST required" }, 405);
  const supplied = req.headers.get("x-buffer-cron-secret") || "";
  let expected = "";
  try { expected = await expectedSecret(); } catch { return out({ error: "Auth configuration unavailable" }, 503); }
  if (!same(supplied, expected)) return out({ error: "Unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const queueId = String(body?.queue_id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(queueId)) return out({ error: "Valid queue_id required" }, 400);

    const { data: item, error: itemError } = await db.from("content_queue")
      .select("id,status,platform,asset_url,metadata,title")
      .eq("id", queueId).maybeSingle();
    if (itemError) throw itemError;
    if (!item) return out({ error: "Queue item not found" }, 404);
    if (item.platform !== "tiktok_recruit" || !["approved", "failed"].includes(String(item.status))) {
      return out({ error: "Only approved/failed TikTok recruitment items may be rehosted" }, 409);
    }
    const assetId = String(item.metadata?.content_asset_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(assetId)) return out({ error: "Missing content_asset_id" }, 409);

    const { data: asset, error: assetError } = await db.from("content_asset_registry")
      .select("id,canonical_url,asset_type,mime_type,rights_status,commercial_status,qa_status,origin_review_status,rights_evidence,publish_blockers")
      .eq("id", assetId).maybeSingle();
    if (assetError) throw assetError;
    if (!asset || asset.asset_type !== "video" || asset.rights_status !== "verified" ||
      asset.commercial_status !== "authorized" || asset.qa_status !== "approved" ||
      asset.origin_review_status !== "approved" || !asset.rights_evidence ||
      Object.keys(asset.rights_evidence).length === 0 ||
      (Array.isArray(asset.publish_blockers) && asset.publish_blockers.length > 0)) {
      return out({ error: "Rights/origin/QA gate did not pass" }, 409);
    }

    const sourceUrl = String(asset.canonical_url || item.asset_url || "");
    if (!allowedDropbox(sourceUrl)) return out({ error: "Source must be an allowlisted public Dropbox video URL" }, 400);
    const source = await fetch(sourceUrl, { redirect: "follow", signal: AbortSignal.timeout(30000) });
    if (!source.ok || !source.body) return out({ error: "Source download failed", source_status: source.status }, 502);
    const mime = (source.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const length = Number(source.headers.get("content-length") || "0");
    if (mime !== "video/mp4" && mime !== "video/quicktime") {
      await source.body.cancel();
      return out({ error: "Unsupported source MIME type", mime }, 415);
    }
    if (length > 50 * 1024 * 1024) {
      await source.body.cancel();
      return out({ error: "Source exceeds 50 MB rehost limit", length }, 413);
    }
    const bytes = await source.arrayBuffer();
    if (bytes.byteLength < 1024 || bytes.byteLength > 50 * 1024 * 1024) {
      return out({ error: "Downloaded media size outside allowed range", bytes: bytes.byteLength }, 413);
    }
    const ext = mime === "video/quicktime" ? "mov" : "mp4";
    const path = `bigo-highlights/${assetId}.${ext}`;
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime, upsert: true, cacheControl: "31536000"
    });
    if (uploadError) throw new Error(`Public media upload failed: ${uploadError.message}`);
    const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = String(publicData?.publicUrl || "");
    if (!publicUrl.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`)) {
      throw new Error("Public media URL verification failed");
    }

    const { error: registryUpdateError } = await db.from("content_asset_registry")
      .update({ canonical_url: publicUrl, mime_type: mime, updated_at: new Date().toISOString() })
      .eq("id", assetId);
    if (registryUpdateError) throw registryUpdateError;
    const { error: queueUpdateError } = await db.from("content_queue").update({
      asset_url: publicUrl,
      status: "approved",
      error_message: null,
      updated_at: new Date().toISOString(),
      metadata: { ...(item.metadata || {}), rehosted_from: sourceUrl, rehosted_at: new Date().toISOString(), rehost_bucket: BUCKET }
    }).eq("id", queueId);
    if (queueUpdateError) throw queueUpdateError;
    return out({ ok: true, queue_id: queueId, content_asset_id: assetId, public_url: publicUrl, bytes: bytes.byteLength, mime, rights_gate: "passed" });
  } catch (e) {
    return out({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
