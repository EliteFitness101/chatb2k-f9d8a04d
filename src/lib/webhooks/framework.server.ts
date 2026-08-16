import { createHash, createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent, audit } from "@/lib/events.server";
import { raiseAlert } from "@/lib/alerts.server";

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
  eventKey: string;
  type: "paid" | "failed" | "refunded" | "ignored";
  reference: string | null;
  amountMinor: number;
  currency: string;
  email: string | null;
  metadata: Record<string, unknown>;
}

export interface ProviderAdapter {
  code: string;
  verify: (raw: string, headers: Headers) => boolean | Promise<boolean>;
  normalize: (payload: unknown) => NormalizedEvent;
}

export function hmacMatches(
  raw: string,
  signature: string | null,
  secret: string,
  algo: "sha512" | "sha256",
) {
  if (!signature || !secret) return false;
  const expected = createHmac(algo, secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function amountMajor(amountMinor: number) {
  return amountMinor / 100;
}

/**
 * Canonical payment pipeline:
 * Receive → Verify → Idempotency → Persist → Finalize canonical ledger →
 * Revenue event → Audit → Downstream event.
 *
 * The previous implementation targeted retired `orders`, `domain_events`,
 * and `payment_events(provider,event_key,...)` columns. Production now uses
 * `payments`, `payment_events`, `payment_event_processing`, `revenue_events`,
 * and the `finalize_payment_success` RPC.
 */
export async function processWebhook(adapter: ProviderAdapter, request: Request): Promise<Response> {
  const raw = await request.text();

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
  const payloadHash = createHash("sha256").update(raw).digest("hex");

  // Paystack has a canonical reference-processing ledger in production.
  if (adapter.code === "paystack" && event.reference) {
    const { data: existing } = await supabaseAdmin
      .from("payment_event_processing")
      .select("id,status")
      .eq("paystack_ref", event.reference)
      .maybeSingle();
    if (existing) return new Response("duplicate", { status: 200 });
  }

  const { error: eventPersistError } = await supabaseAdmin.from("payment_events").insert({
    event: event.type,
    payload: payload as never,
    paystack_ref: event.reference,
    processed: false,
    signature_verified: true,
    source: adapter.code,
  });

  if (eventPersistError) {
    console.error("[webhook] canonical payment_events insert failed", eventPersistError);
    return new Response("Event persistence failed", { status: 500 });
  }

  if (adapter.code === "paystack" && event.reference) {
    const { error: processingError } = await supabaseAdmin
      .from("payment_event_processing")
      .insert({ paystack_ref: event.reference, status: "processing" });
    if (processingError?.code === "23505") return new Response("duplicate", { status: 200 });
    if (processingError) {
      console.error("[webhook] processing ledger insert failed", processingError);
      return new Response("Processing ledger failed", { status: 500 });
    }
  }

  if (event.type === "ignored" || !event.reference) return new Response("ok");

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,paystack_ref,product_sku,plan_type,rsid,customer_email,funnel_origin")
    .eq("paystack_ref", event.reference)
    .maybeSingle();

  const meta = event.metadata;
  const productSku =
    typeof meta.sku === "string" ? meta.sku : payment?.product_sku ?? null;
  const rsid = typeof meta.rsid === "string" ? meta.rsid : payment?.rsid ?? null;
  const funnelOrigin =
    typeof meta.funnel_origin === "string" ? meta.funnel_origin : payment?.funnel_origin ?? "chatb2k";
  const utm = meta.utm && typeof meta.utm === "object" ? meta.utm : {};

  if (event.type === "paid") {
    // Canonical stored procedure performs the production-side customer,
    // subscriber and payment-success finalization atomically.
    const { error: finalizeError } = await supabaseAdmin.rpc("finalize_payment_success", {
      p_amount: amountMajor(event.amountMinor),
      p_chat_id: null,
      p_currency: event.currency,
      p_email: event.email ?? payment?.customer_email ?? "",
      p_funnel_origin: funnelOrigin,
      p_paystack_ref: event.reference,
      p_plan_type: payment?.plan_type ?? "commerce",
      p_product_sku: productSku ?? "",
      p_rsid: rsid ?? "",
    });

    if (finalizeError) {
      console.error("[webhook] canonical payment finalization failed", finalizeError);
      await supabaseAdmin
        .from("payment_event_processing")
        .update({ status: "failed" })
        .eq("paystack_ref", event.reference);
      await raiseAlert(
        "critical",
        "payment",
        "Canonical payment finalization failed",
        { reference: event.reference, provider: adapter.code },
        "payment",
        event.reference,
      );
      return new Response("Payment finalization failed", { status: 500 });
    }

    await supabaseAdmin
      .from("payments")
      .update({
        status: "success",
        paid_at: new Date().toISOString(),
        gateway_response: "webhook_verified",
        reconciled: false,
      })
      .eq("paystack_ref", event.reference);

    await supabaseAdmin.from("revenue_events").insert({
      amount: amountMajor(event.amountMinor),
      currency: event.currency,
      email: event.email ?? payment?.customer_email ?? null,
      payment_id: payment?.id ?? null,
      payment_reference: event.reference,
      product_slug: productSku,
      rsid,
      status: "success",
      utm: utm as never,
      campaign: typeof meta.utm_campaign === "string" ? meta.utm_campaign : null,
    });

    await publishEvent("PaymentVerified", "payment", event.reference, {
      provider: adapter.code,
      reference: event.reference,
      amount_minor: event.amountMinor,
      currency: event.currency,
      product_sku: productSku,
      rsid,
      funnel_origin: funnelOrigin,
      utm,
    });

    await audit("payment.verified", "payment", event.reference, {
      provider: adapter.code,
      amount_minor: event.amountMinor,
      currency: event.currency,
      product_sku: productSku,
    });
  } else if (event.type === "failed" || event.type === "refunded") {
    const status = event.type === "refunded" ? "refunded" : "failed";
    await supabaseAdmin
      .from("payments")
      .update({ status, gateway_response: `webhook_${status}` })
      .eq("paystack_ref", event.reference);

    if (event.type === "refunded") {
      await supabaseAdmin
        .from("revenue_events")
        .update({ status: "refunded" })
        .eq("payment_reference", event.reference);
    }

    await publishEvent(
      event.type === "refunded" ? "PaymentRefunded" : "PaymentFailed",
      "payment",
      event.reference,
      {
        provider: adapter.code,
        reference: event.reference,
        amount_minor: event.amountMinor,
        currency: event.currency,
        rsid,
      },
    );

    await audit(`payment.${status}`, "payment", event.reference, {
      provider: adapter.code,
      amount_minor: event.amountMinor,
      currency: event.currency,
    });
  }

  if (adapter.code === "paystack" && event.reference) {
    await supabaseAdmin
      .from("payment_event_processing")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("paystack_ref", event.reference);
  }

  // Keep the existing Make automation integration, but send the canonical
  // normalized event rather than an obsolete order object.
  const makeUrl = process.env.MAKE_WEBHOOK_URL;
  if (makeUrl) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const shared = process.env.MAKE_WEBHOOK_SECRET;
      if (shared) headers["x-shared-secret"] = shared;
      await fetch(makeUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ provider: adapter.code, event, payloadHash }),
      });
    } catch (e) {
      console.error("[webhook] notify failed", e);
    }
  }

  return new Response("ok");
}
