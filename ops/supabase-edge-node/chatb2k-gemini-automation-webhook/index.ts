import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAIN_URL = "https://vbqjvmnhdtdhmeeudqnn.supabase.co";
const MAIN_PUBLISHABLE_KEY = "sb_publishable_fu_Y3KQipfuomFQyd3zNtA_rG9XpOfG";
const cors = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "https://chatb2k.resofit.fit",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-chatb2k-automation-key, x-idempotency-key",
};
const allowedEvents = new Set([
  "funnel.page_viewed", "funnel.cta_clicked", "assessment.started", "assessment.completed",
  "conversation.whatsapp_clicked", "checkout.started", "application.submitted",
  "commerce.search", "commerce.product_viewed", "commerce.product_clicked", "commerce.compare",
  "commerce.price_filtered", "commerce.wishlist_added", "commerce.wishlist_removed", "commerce.cart_added",
]);
const eventPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]+)+$/;
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}
function equalSecret(a: string, b: string) {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  const adminUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!adminUrl || !serviceKey) return reply({ ok: false, error: "edge_storage_not_configured" }, 503);
  const admin = createClient(adminUrl, serviceKey, { auth: { persistSession: false } });
  let expected = Deno.env.get("CHATB2K_GEMINI_WEBHOOK_SECRET") ?? "";
  if (!expected) expected = Deno.env.get("GEMINI_AUTOMATION_API_KEY") ?? "";
  if (!expected) {
    const vault = await admin.rpc("get_chatb2k_vault_secret", { p_name: "chatb2k_gemini_automation_api_key" });
    if (!vault.error && typeof vault.data === "string") expected = vault.data;
  }
  const supplied = req.headers.get("x-chatb2k-automation-key") ?? "";
  if (!expected) return reply({ ok: false, error: "webhook_secret_not_configured", setup_required: ["CHATB2K_GEMINI_WEBHOOK_SECRET"] }, 503);
  if (!equalSecret(supplied, expected)) return reply({ ok: false, error: "unauthorized" }, 401);
  let raw = "";
  try { raw = await req.text(); } catch { return reply({ ok: false, error: "body_read_failed" }, 400); }
  if (new TextEncoder().encode(raw).byteLength > 16000) return reply({ ok: false, error: "payload_too_large" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return reply({ ok: false, error: "invalid_json" }, 400); }
  const eventName = String(body.event_name ?? "");
  if (!eventPattern.test(eventName) || !allowedEvents.has(eventName)) return reply({ ok: false, error: "event_not_allowlisted" }, 403);
  const eventId = String(req.headers.get("x-idempotency-key") ?? body.idempotency_key ?? body.event_id ?? crypto.randomUUID());
  if (!eventId || eventId.length > 180) return reply({ ok: false, error: "invalid_event_id" }, 400);
  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : {};
  const contractVersion = String(body.contract_version ?? "1.0");
  const { data: existing } = await admin.from("chatb2k_webhook_events").select("event_id,status,main_response").eq("event_id", eventId).maybeSingle();
  if (existing?.status === "synced") return reply({ ok: true, replay: true, event_id: eventId, sync_status: "synced", main_response: existing.main_response });
  const { error: localError } = await admin.from("chatb2k_webhook_events").upsert({
    event_id: eventId, event_name: eventName, source: "gemini-automation", payload,
    status: "received", error_code: null, updated_at: new Date().toISOString()
  }, { onConflict: "event_id" });
  if (localError) return reply({ ok: false, error: "edge_event_persist_failed" }, 500);
  const outgoing = {
    event_name: eventName, contract_version: contractVersion, idempotency_key: eventId,
    occurred_at: body.occurred_at ?? new Date().toISOString(),
    source_system: "chatb2k-gemini-automation", adapters: ["resoflex-edge-node"],
    correlation_id: body.correlation_id ?? eventId, session_id: body.session_id ?? null,
    anonymous_id: body.anonymous_id ?? null, rsid: body.rsid ?? null,
    funnel_origin: body.funnel_origin ?? null, utm: body.utm && typeof body.utm === "object" ? body.utm : {},
    payload,
  };
  try {
    const response = await fetch(MAIN_URL + "/functions/v1/resofit-event-ingest", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: MAIN_PUBLISHABLE_KEY, authorization: "Bearer " + MAIN_PUBLISHABLE_KEY, "x-request-id": eventId },
      body: JSON.stringify(outgoing),
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    let result: unknown;
    try { result = JSON.parse(text); } catch { result = { response_excerpt: text.slice(0, 500) }; }
    await admin.from("chatb2k_webhook_events").update({
      status: response.ok ? "synced" : "sync_failed", main_response: result,
      error_code: response.ok ? null : "main_ingest_http_" + response.status,
      synced_at: response.ok ? new Date().toISOString() : null, updated_at: new Date().toISOString()
    }).eq("event_id", eventId);
    return reply({ ok: response.ok, event_id: eventId, sync_status: response.ok ? "synced" : "sync_failed", main_status: response.status, main_response: result }, response.ok ? 200 : 502);
  } catch {
    await admin.from("chatb2k_webhook_events").update({ status: "sync_failed", error_code: "main_ingest_network_error", updated_at: new Date().toISOString() }).eq("event_id", eventId);
    return reply({ ok: false, event_id: eventId, sync_status: "sync_failed", error: "main_ingest_unreachable" }, 502);
  }
});
