import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent, audit } from "@/lib/events.server";
import { allocateOrder } from "@/lib/fulfillment.server";
import { raiseAlert } from "@/lib/alerts.server";

/** Canonical payment lifecycle shared across every provider adapter. */
export type PaymentStatus =
  | "created"
  | "authorized"
  | "paid"
  | "verified"
  | "fulfillment_started"
  | "completed"
  | "refunded"
  | "failed";

export interface NormalizedEvent {
  eventKey: string; // provider-unique id used for idempotency
  type: "paid" | "failed" | "refunded" | "ignored";
  reference: string | null;
  amountMinor: number;
  currency: string;
  email: string | null;
  metadata: Record<string, unknown>;
}

export interface ProviderAdapter {
  code: string;
  /** Verify the raw body against the request's signature header. */
  verify: (raw: string, headers: Headers) => boolean | Promise<boolean>;
  /** Map the provider payload onto the canonical event shape. */
  normalize: (payload: unknown) => NormalizedEvent;
}

export function hmacMatches(raw: string, signature: string | null, secret: string, algo: "sha512" | "sha256") {
  if (!signature) return false;
  const expected = createHmac(algo, secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LIFECYCLE: Record<NormalizedEvent["type"], PaymentStatus> = {
  paid: "paid",
  failed: "failed",
  refunded: "refunded",
  ignored: "created",
};

/**
 * Shared processing pipeline:
 * Receive → Verify → Reject invalid → Idempotency → Persist raw event →
 * Update payment → Update order → Audit → Trigger fulfillment → Notify.
 */
export async function processWebhook(adapter: ProviderAdapter, request: Request): Promise<Response> {
  const raw = await request.text();

  // 1–2. Verify signature, reject invalid.
  let valid = false;
  try {
    valid = await adapter.verify(raw, request.headers);
  } catch {
    valid = false;
  }
  if (!valid) {
    await publishEvent("WebhookRejected", "payment", null, { provider: adapter.code });
    await raiseAlert(
      "critical",
      "webhook",
      `Rejected ${adapter.code} webhook (invalid signature)`,
      { provider: adapter.code },
      "payment_provider",
      adapter.code,
    );
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const event = adapter.normalize(payload);

  // 3. Idempotency + 4. persist raw event.
  const { error: dupeErr } = await supabaseAdmin.from("payment_events").insert({
    provider: adapter.code,
    event_key: event.eventKey,
    event_type: event.type,
    reference: event.reference,
    payload: payload as never,
  });
  if (dupeErr) {
    // Unique violation on (provider, event_key) → already processed.
    if (dupeErr.code === "23505") return new Response("duplicate", { status: 200 });
    console.error("[webhook] event persist failed", dupeErr);
  }

  if (event.type === "ignored" || !event.reference) {
    return new Response("ok");
  }

  const status = LIFECYCLE[event.type];

  // 5. Update payment.
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, reference")
    .eq("reference", event.reference)
    .maybeSingle();

  await supabaseAdmin.from("payments").upsert(
    {
      order_id: order?.id ?? null,
      provider: adapter.code,
      reference: event.reference,
      currency: event.currency,
      amount_minor: event.amountMinor,
      status,
      metadata: event.metadata as never,
    },
    { onConflict: "reference" },
  );

  // 6. Update order.
  const orderStatus =
    event.type === "paid" ? "paid" : event.type === "refunded" ? "refunded" : "failed";
  await supabaseAdmin.from("orders").update({ status: orderStatus }).eq("reference", event.reference);

  // 7. Audit + domain event.
  await audit(`payment.${event.type}`, "order", event.reference, {
    provider: adapter.code,
    amount_minor: event.amountMinor,
  });
  await publishEvent(
    event.type === "paid" ? "PaymentVerified" : event.type === "refunded" ? "PaymentRefunded" : "PaymentFailed",
    "order",
    order?.id ?? event.reference,
    { provider: adapter.code, reference: event.reference },
  );

  // Revenue OS attribution snapshot.
  if (event.type === "paid") {
    const meta = event.metadata;
    await supabaseAdmin.from("revenue_events").upsert(
      {
        reference: event.reference,
        amount_minor: event.amountMinor,
        currency: event.currency,
        email: event.email,
        rsid: typeof meta.rsid === "string" ? meta.rsid : null,
        utm: (meta.utm && typeof meta.utm === "object" ? meta.utm : {}) as never,
        product_sku: typeof meta.sku === "string" ? meta.sku : null,
        variant: typeof meta.variant === "string" ? meta.variant : null,
        source: typeof meta.source === "string" ? meta.source : adapter.code,
        status: "success",
        lifecycle_stage: "paid",
      },
      { onConflict: "reference", ignoreDuplicates: true },
    );
  } else if (event.type === "refunded") {
    await supabaseAdmin
      .from("revenue_events")
      .update({ status: "refunded", lifecycle_stage: "refunded" })
      .eq("reference", event.reference);
  }

  // 8. Trigger fulfillment.
  if (event.type === "paid" && order?.id) {
    await allocateOrder(order.id);
  }

  if (event.type === "failed") {
    await raiseAlert(
      "warning",
      "payment",
      `Payment failed on ${adapter.code}`,
      { reference: event.reference, amount_minor: event.amountMinor },
      "order",
      event.reference,
    );
  }

  // 9. Notify customer / downstream automation.
  const makeUrl = process.env["MAKE_WEBHOOK_URL"];
  if (makeUrl) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const shared = process.env["MAKE_WEBHOOK_SECRET"];
      if (shared) headers["x-shared-secret"] = shared;
      await fetch(makeUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ provider: adapter.code, event }),
      });
    } catch (e) {
      console.error("[webhook] notify failed", e);
    }
  }

  return new Response("ok");
}