import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const vault = supabase?.schema("vault");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function readVerifyToken(): Promise<string | null> {
  if (!vault) throw new Error("Supabase service configuration unavailable");
  const { data, error } = await vault.from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", "whatsapp_verify_token")
    .maybeSingle();
  if (error) throw error;
  return data?.decrypted_secret ?? null;
}

async function readMetaAppSecret(): Promise<string | null> {
  // Configure this as an Edge Function secret. Never put it in source control.
  const value = Deno.env.get("META_APP_SECRET");
  return value?.trim() || null;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyMetaSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !/^sha256=[0-9a-f]{64}$/i.test(header)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = "sha256=" + hex(new Uint8Array(signature));
  return constantTimeHexEqual(expected.toLowerCase(), header.toLowerCase());
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !verifyToken || !challenge) {
      return json({ ok: false, error: "invalid_verification_request" }, 400);
    }
    try {
      const expected = await readVerifyToken();
      if (!expected || verifyToken !== expected) return json({ ok: false, error: "verification_failed" }, 403);
      return new Response(challenge, {
        headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
      });
    } catch (error) {
      console.error("WhatsApp webhook challenge verification unavailable", error);
      return json({ ok: false, error: "verification_unavailable" }, 503);
    }
  }

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!supabase) return json({ ok: false, error: "webhook_storage_unavailable" }, 503);

  // Authenticate the exact raw request bytes before JSON parsing or persistence.
  const appSecret = await readMetaAppSecret();
  if (!appSecret) {
    console.error("WhatsApp webhook rejected: META_APP_SECRET is not configured");
    return json({ ok: false, error: "webhook_authentication_unavailable" }, 503);
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > 2_000_000) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  try {
    const valid = await verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret);
    if (!valid) return json({ ok: false, error: "invalid_signature" }, 401);
  } catch (error) {
    console.error("WhatsApp webhook signature verification failed", error);
    return json({ ok: false, error: "signature_verification_failed" }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  try {
    const rows: any[] = [];
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      for (const change of (Array.isArray(entry?.changes) ? entry.changes : [])) {
        const value = change?.value ?? {};
        const field = change?.field ?? "unknown";
        const phoneNumberId = value?.metadata?.phone_number_id ?? null;
        const wabaId = entry?.id ?? null;

        for (const message of (Array.isArray(value?.messages) ? value.messages : [])) {
          rows.push({
            event_key: `message:${message?.id ?? await sha256(JSON.stringify(message))}`,
            waba_id: wabaId,
            phone_number_id: phoneNumberId,
            event_type: field,
            from_wa_id: message?.from ?? null,
            message_id: message?.id ?? null,
            status: null,
            payload: { entry, change, message },
          });
        }

        for (const status of (Array.isArray(value?.statuses) ? value.statuses : [])) {
          rows.push({
            event_key: `status:${status?.id ?? await sha256(JSON.stringify(status))}:${status?.status ?? "unknown"}`,
            waba_id: wabaId,
            phone_number_id: phoneNumberId,
            event_type: field,
            from_wa_id: status?.recipient_id ?? null,
            message_id: status?.id ?? null,
            status: status?.status ?? null,
            payload: { entry, change, status },
          });
        }

        if (!value?.messages?.length && !value?.statuses?.length) {
          rows.push({
            event_key: `change:${await sha256(JSON.stringify(change))}`,
            waba_id: wabaId,
            phone_number_id: phoneNumberId,
            event_type: field,
            payload: { entry, change },
            from_wa_id: null,
            message_id: null,
            status: null,
          });
        }
      }
    }

    if (rows.length) {
      const { error } = await supabase.from("whatsapp_webhook_events")
        .upsert(rows, { onConflict: "event_key", ignoreDuplicates: true });
      if (error) throw error;
    }
    return json({ ok: true, received: entries.length, stored: rows.length });
  } catch (error) {
    console.error("Authenticated WhatsApp webhook persistence failed", error);
    return json({ ok: false, error: "processing_failed" }, 500);
  }
});
