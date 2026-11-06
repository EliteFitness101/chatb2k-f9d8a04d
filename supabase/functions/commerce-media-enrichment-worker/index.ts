import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const BUCKET = "digital-product-media";
const CONTROL_PLANE = SUPABASE_URL + "/functions/v1/resofit-media-control-plane";
const cors = { "content-type": "application/json", "cache-control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function equal(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function authorized(req: Request) {
  let expected = Deno.env.get("CONTENT_CRON_SECRET") || Deno.env.get("BUFFER_CRON_SECRET") || "";
  if (!expected) {
    const secret = await db.rpc("get_buffer_cron_secret");
    if (!secret.error && secret.data) expected = String(secret.data);
  }
  const provided = req.headers.get("x-content-cron-secret") || req.headers.get("x-buffer-cron-secret") || "";
  if (expected && equal(expected, provided)) return true;
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    const payload = bearer.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    return decoded.role === "service_role";
  } catch { return false; }
}
function safeKey(value: string) {
  return value.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "unidentified-product";
}
function clean(value: unknown, max = 1200): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  if (Array.isArray(value)) return value.map(v => clean(v, 180)).filter(Boolean).join("; ").slice(0, max);
  if (typeof value === "object") return JSON.stringify(value).slice(0, max);
  return String(value).slice(0, max);
}
function factsMarkdown(job: any, role: string) {
  const s = job.source_snapshot || {};
  const title = clean(job.source_title, 180) || "Product guide";
  const description = clean(s.description);
  const features = clean(s.features);
  const instructions = clean(s.usage_instructions || s.instructions || s.how_to_use || s.setup_instructions);
  const type = clean(s.product_type);
  const tags = clean(s.tags);
  const source = clean(s.source_url, 600);
  if (role === "video_setup_brief") {
    return [
      "# Video setup-guide production brief",
      "",
      "## Product",
      title,
      "",
      "## Verified source facts",
      description || "No verified product description was supplied.",
      type ? "Product type: " + type : "",
      features ? "Features/attributes: " + features : "",
      instructions ? "Supplier instructions: " + instructions : "No setup instructions were present in the ingested record. Do not invent assembly, safety, operating or maintenance steps.",
      source ? "Source page: " + source : "",
      "",
      "## Production direction",
      "Create a concise, clearly narrated setup walkthrough using only the verified facts and instructions above. Show only steps that are explicitly documented. If steps are missing, show product identification and a neutral 'consult the supplied manufacturer manual' closing. No invented compatibility, safety, performance, medical, warranty, stock, delivery or outcome claims.",
      "",
      "## QA requirements",
      "- Match the exact product/model shown to the source record.",
      "- Verify every spoken and on-screen factual claim.",
      "- Check safety language, subtitles, audio, aspect ratio and legibility.",
      "- Hold publication if source instructions or product identity are ambiguous."
    ].filter(Boolean).join("\n");
  }
  return [
    "# Quick-start guide",
    "",
    "## " + title,
    "",
    description || "This guide is based on the verified product record. A fuller description is pending source enrichment.",
    "",
    "## Verified product information",
    type ? "- Product type: " + type : "",
    features ? "- Features/attributes: " + features : "",
    tags ? "- Catalog tags: " + tags : "",
    source ? "- Source listing: " + source : "",
    "",
    "## Setup and use",
    instructions
      ? instructions.split(/\n|;|\. (?=[A-Z])/).map((x: string) => x.trim()).filter(Boolean).map((x: string, i: number) => (i + 1) + ". " + x).join("\n")
      : "The ingested source did not contain verified setup or operating instructions. Check the manufacturer's supplied manual and product labels before assembly or use. Do not rely on guessed steps.",
    "",
    "## Support and safety",
    "Follow the manufacturer's warnings, ratings and instructions. Stop and seek supplier support if the model, included parts or safe operating procedure is unclear.",
    "",
    "_Prepared automatically by ChatB2K from the product's ingested source record. This is an informational companion, not a replacement for the manufacturer's official manual._"
  ].filter(Boolean).join("\n");
}
function documentQa(markdown: string, title: string, role: string) {
  const checks = {
    non_empty: markdown.trim().length >= 250,
    title_grounded: markdown.toLowerCase().includes(title.toLowerCase()),
    has_safety_or_provenance_note: /manufacturer|source record|verified facts|source facts/i.test(markdown),
    no_high_risk_claims: !/\\b(cure|guaranteed results|guaranteed weight loss|instant results|diagnose|treats? disease|clinically proven)\\b/i.test(markdown)
  };
  const failed = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
  return { status: failed.length ? "hold" : "pass", checks, failed, role };
}
async function putAsset(key: string, content: string) {
  const bytes = new TextEncoder().encode(content);
  const base64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
  try {
    const r = await fetch(CONTROL_PLANE, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + SERVICE_KEY },
      body: JSON.stringify({ action: "put", key, body_base64: base64, content_type: "text/markdown; charset=utf-8" }),
      signal: AbortSignal.timeout(65000)
    });
    const result = await r.json().catch(() => ({}));
    if (r.ok && result.ok && result.public_url) {
      return { provider: "cloudflare_r2", bucket: "resofit-cdn", key, url: result.public_url, bytes: bytes.length };
    }
  } catch { /* Supabase Storage fallback below. */ }
  const path = key.replace(/^resofit\//, "commerce-vas/");
  const upload = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "text/markdown; charset=utf-8", upsert: true });
  if (upload.error) throw upload.error;
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { provider: "supabase_storage", bucket: BUCKET, key: path, url, bytes: bytes.length };
}
async function createOrReuseAsset(job: any, role: string) {
  const snapshot = job.source_snapshot || {};
  const fingerprintInput = JSON.stringify({
    title: job.source_title,
    type: snapshot.product_type || null,
    features: snapshot.features || null,
    instructions: snapshot.usage_instructions || snapshot.instructions || snapshot.how_to_use || null
  });
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprintInput))))
    .map(x => x.toString(16).padStart(2, "0")).join("");
  const { data: reused } = await db.from("content_asset_registry")
    .select("id,canonical_url,asset_type,qa_status,intelligence")
    .eq("asset_type", "document")
    .eq("qa_status", "approved")
    .contains("intelligence", { feature_fingerprint: fingerprint })
    .limit(1).maybeSingle();
  if (reused) {
    const { error } = await db.from("commerce_media_asset_links").upsert({
      enrichment_job_id: job.id, source_entity: job.source_entity, source_record_id: job.source_record_id,
      asset_registry_id: reused.id, asset_role: role, asset_type: "document",
      canonical_url: reused.canonical_url, qa_status: "approved", reuse_scope: "same_product_and_equivalent_products",
      metadata: { reused: true, feature_fingerprint: fingerprint }
    }, { onConflict: "enrichment_job_id,asset_role,asset_type" });
    if (error) throw error;
    return { id: reused.id, url: reused.canonical_url, reused: true };
  }

  const markdown = factsMarkdown(job, role);
  const qa = documentQa(markdown, clean(job.source_title, 180) || "Product guide", role);
  const key = "resofit/products/" + safeKey(job.source_sku || job.source_handle || job.source_record_id) +
    "/guides/" + role + "-" + fingerprint.slice(0, 12) + ".md";
  const stored = await putAsset(key, markdown);
  const sourceAssetId = job.idempotency_key + ":" + role + ":" + fingerprint;
  const { data: asset, error: assetError } = await db.from("content_asset_registry").upsert({
    source_provider: "chatb2k_media_enrichment",
    source_asset_id: sourceAssetId,
    source_url: stored.url,
    canonical_url: stored.url,
    brand: "ResoFit / ResoFlex",
    campaign: "commerce_product_enrichment",
    asset_type: "document",
    mime_type: "text/markdown",
    rights_status: "original_generated",
    commercial_status: "included_vas",
    qa_status: qa.status === "pass" ? "pending" : "hold",
    qa_reason: qa.status === "pass" ? "Automated structural, source-grounding and claim-risk checks passed; publication review remains separate." : "Automated document QA held: " + qa.failed.join(", "),
    content_pillar: "PRODUCT_EDUCATION",
    fingerprint,
    intelligence: {
      enrichment_job_id: job.id,
      source_entity: job.source_entity,
      source_record_id: job.source_record_id,
      source_sku: job.source_sku,
      source_handle: job.source_handle,
      asset_role: role,
      feature_fingerprint: fingerprint,
      storage_provider: stored.provider,
      storage_bucket: stored.bucket,
      storage_key: stored.key,
      reusable: true,
      document_qa: qa,
      customer_charge: 0,
      funding_policy: "supplier_markup_30pct_shared_vas_pool"
    },
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: "source_provider,source_asset_id" }).select("id,canonical_url,asset_type,qa_status").single();
  if (assetError) throw assetError;
  const { error: linkError } = await db.from("commerce_media_asset_links").upsert({
    enrichment_job_id: job.id, source_entity: job.source_entity, source_record_id: job.source_record_id,
    asset_registry_id: asset.id, asset_role: role, asset_type: "document",
    canonical_url: asset.canonical_url, storage_provider: stored.provider,
    storage_bucket: stored.bucket, storage_key: stored.key, content_sha256: fingerprint,
    qa_status: qa.status === "pass" ? "pending" : "hold", reuse_scope: "same_product_and_equivalent_products",
    metadata: { reused: false, bytes: stored.bytes }
  }, { onConflict: "enrichment_job_id,asset_role,asset_type" });
  if (linkError) throw linkError;
  return { id: asset.id, url: asset.canonical_url, reused: false, storage: stored.provider, document_qa: qa };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  if (!await authorized(req)) return reply({ ok: false, error: "unauthorized" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { return reply({ ok: false, error: "invalid_json" }, 400); }
  const limit = Math.min(Math.max(Number(body.limit || 3), 1), 10);
  const { data: jobs, error } = await db.from("commerce_media_enrichment_jobs")
    .select("*").eq("status", "queued").or("next_attempt_at.is.null,next_attempt_at.lte." + new Date().toISOString())
    .order("priority", { ascending: true }).order("created_at", { ascending: true }).limit(limit);
  if (error) return reply({ ok: false, error: "queue_read_failed", detail: error.message }, 500);
  const results: any[] = [];
  for (const job of jobs || []) {
    const claim = await db.from("commerce_media_enrichment_jobs")
      .update({ status: "processing", attempt_count: Number(job.attempt_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("status", "queued").select("id").maybeSingle();
    if (!claim.data) { results.push({ id: job.id, status: "skipped_claimed" }); continue; }
    try {
      const guide = await createOrReuseAsset(job, "quick_start_guide");
      const videoBrief = await createOrReuseAsset(job, "video_setup_brief");
      const held = [guide.document_qa?.status, videoBrief.document_qa?.status].includes("hold");
      await db.from("commerce_media_enrichment_jobs").update({
        status: held ? "held" : "qa",
        generation_spec: { ...(job.generation_spec || {}), generated_roles: ["quick_start_guide", "video_setup_brief"], video_rendering: "deferred_until_reuse_check_and_cost_gate", funding_policy: "supplier_markup_30pct_shared_vas_pool" },
        asset_plan: [
          { role: "quick_start_guide", type: "digital_guide", status: guide.reused ? "reused" : "generated", asset_id: guide.id, url: guide.url },
          { role: "video_setup_brief", type: "video_production_brief", status: videoBrief.reused ? "reused" : "generated", asset_id: videoBrief.id, url: videoBrief.url },
          { role: "setup_video", type: "video", status: "reuse_first_then_cost_gate", required: false }
        ],
        updated_at: new Date().toISOString()
      }).eq("id", job.id);
      results.push({ id: job.id, status: held ? "held" : "qa", guide, videoBrief });
    } catch (e) {
      const detail = String(e).slice(0, 500);
      await db.from("commerce_media_enrichment_jobs").update({
        status: "failed", last_error_code: "MEDIA_ENRICHMENT_FAILED", last_error_detail: detail,
        next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(Number(job.attempt_count || 0), 6))).toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", job.id);
      results.push({ id: job.id, status: "failed", error: detail });
    }
  }
  return reply({ ok: true, claimed: results.length, results, generated_without_external_ai: true });
});
