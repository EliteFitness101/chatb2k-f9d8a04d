import { createHash, createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent, audit } from "@/lib/events.server";
import { allocatePayment } from "@/lib/fulfillment.server";
import { raiseAlert } from "@/lib/alerts.server";

export type PaymentStatus = "created" | "authorized" | "paid" | "verified" | "fulfillment_started" | "completed" | "refunded" | "failed";

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

export function hmacMatches(raw: string, signature: string | null, secret: string, algo: "sha512" | "sha256") {
  if (!signature || !secret) return false;
  const expected = createHmac(algo, secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function amountMajor(amountMinor: number) {
  return amountMinor / 100;
}

export async function processWebhook(adapter: ProviderAdapter, request: Request): Promise<Response> {
  const raw = await request.text();
  let valid = false;
  try { valid = await adapter.verify(raw, request.headers); } catch { valid = false; }

  if (!valid) {
    await publishEvent("WebhookRejected", "payment", null, { provider: adapter.code });
    await raiseAlert("critical", "webhook", `Rejected ${adapter.code} webhook (invalid signature)`, { provider: adapter.code }, "payment_provider", adapter.code);
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }

  const event = adapter.normalize(payload);
  const payloadHash = createHash("sha256").update(raw).digest("hex");

  if (adapter.code === "paystack" && event.reference) {
    const { data: existing } = await supabaseAdmin.from("payment_event_processing").select("id,status").eq("paystack_ref", event.reference).maybeSingle();
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
    const { error: processingError } = await supabaseAdmin.from("payment_event_processing").insert({ paystack_ref: event.reference, status: "processing" });
    if (processingError?.code === "23505") return new Response("duplicate", { status: 200 });
    if (processingError) return new Response("Processing ledger failed", { status: 500 });
  }

  if (event.type === "ignored" || !event.reference) return new Response("ok");

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,paystack_ref,product_sku,plan_type,rsid,customer_email,funnel_origin,amount,currency,user_id")
    .eq("paystack_ref", event.reference)
    .maybeSingle();

  const meta = event.metadata;
  const productSku = typeof meta.sku === "string" ? meta.sku : payment?.product_sku ?? null;
  const rsid = typeof meta.rsid === "string" ? meta.rsid : payment?.rsid ?? null;
  const funnelOrigin = typeof meta.funnel_origin === "string" ? meta.funnel_origin : payment?.funnel_origin ?? "chatb2k";
  const utm = meta.utm && typeof meta.utm === "object" ? meta.utm : {};

  if (event.type === "paid") {
    if (!payment) {
      await supabaseAdmin.from("payment_event_processing").update({ status: "failed" }).eq("paystack_ref", event.reference);
      await raiseAlert("critical", "payment", "Verified payment has no canonical ledger row", { reference: event.reference }, "payment", event.reference);
      return new Response("Payment record not found", { status: 422 });
    }

    const expectedAmount = Number(payment.amount);
    const expectedCurrency = String(payment.currency ?? "NGN").toUpperCase();
    const receivedAmount = amountMajor(event.amountMinor);
    const receivedCurrency = String(event.currency).toUpperCase();

    if (!Number.isFinite(expectedAmount) || Math.abs(expectedAmount - receivedAmount) > 0.000001 || expectedCurrency !== receivedCurrency) {
      await supabaseAdmin.from("payment_event_processing").update({ status: "failed" }).eq("paystack_ref", event.reference);
      await raiseAlert("critical", "payment", "Paystack amount/currency mismatch", {
        reference: event.reference,
        expected_amount: expectedAmount,
        received_amount: receivedAmount,
        expected_currency: expectedCurrency,
        received_currency: receivedCurrency,
      }, "payment", event.reference);
      return new Response("Payment amount or currency mismatch", { status: 422 });
    }

    const { error: finalizeError } = await supabaseAdmin.rpc("finalize_payment_success", {
      p_amount: receivedAmount,
      p_chat_id: null,
      p_currency: receivedCurrency,
      p_email: event.email ?? payment.customer_email ?? "",
      p_funnel_origin: funnelOrigin,
      p_paystack_ref: event.reference,
      p_plan_type: payment.plan_type ?? "commerce",
      p_product_sku: productSku ?? "",
      p_rsid: rsid ?? "",
    });

    if (finalizeError) {
      await supabaseAdmin.from("payment_event_processing").update({ status: "failed" }).eq("paystack_ref", event.reference);
      await raiseAlert("critical", "payment", "Canonical payment finalization failed", { reference: event.reference, provider: adapter.code }, "payment", event.reference);
      return new Response("Payment finalization failed", { status: 500 });
    }

    await supabaseAdmin.from("payments").update({ status: "success", paid_at: new Date().toISOString(), gateway_response: "webhook_verified", reconciled: false }).eq("paystack_ref", event.reference);

    await supabaseAdmin.from("revenue_events").insert({
      amount: receivedAmount,
      currency: receivedCurrency,
      email: event.email ?? payment.customer_email ?? null,
      payment_id: payment.id,
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
      currency: receivedCurrency,
      product_sku: productSku,
      rsid,
      funnel_origin: funnelOrigin,
      utm,
    });
    await audit("payment.verified", "payment", event.reference, { provider: adapter.code, amount_minor: event.amountMinor, currency: receivedCurrency, product_sku: productSku });

    // P1 delivery gate: verified payment -> digital completion OR physical atomic reservation.
    const fulfillment = await allocatePayment(payment.id, {
      countryCode: typeof meta.country === "string" ? meta.country : "NG",
      customerEmail: event.email ?? payment.customer_email ?? undefined,
      items: productSku ? [{ sku: productSku, quantity: 1 }] : [],
    });

    if (!fulfillment.ok) {
      await raiseAlert("critical", "fulfillment", "Payment verified but value delivery allocation failed", {
        reference: event.reference,
        payment_id: payment.id,
        error: fulfillment.error,
      }, "payment", payment.id);
      return new Response("Payment verified; fulfillment allocation failed", { status: 500 });
    }
  } else if (event.type === "failed" || event.type === "refunded") {
    const status = event.type === "refunded" ? "refunded" : "failed";
    await supabaseAdmin.from("payments").update({ status, gateway_response: `webhook_${status}` }).eq("paystack_ref", event.reference);
    if (event.type === "refunded") await supabaseAdmin.from("revenue_events").update({ status: "refunded" }).eq("payment_reference", event.reference);
    await publishEvent(event.type === "refunded" ? "PaymentRefunded" : "PaymentFailed", "payment", event.reference, {
      provider: adapter.code, reference: event.reference, amount_minor: event.amountMinor, currency: event.currency, rsid,
    });
    await audit(`payment.${status}`, "payment", event.reference, { provider: adapter.code, amount_minor: event.amountMinor, currency: event.currency });
  }

  if (adapter.code === "paystack" && event.reference) {
    await supabaseAdmin.from("payment_event_processing").update({ status: "processed", processed_at: new Date().toISOString() }).eq("paystack_ref", event.reference);
  }

  const makeUrl = process.env.MAKE_WEBHOOK_URL;
  if (makeUrl) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const shared = process.env.MAKE_WEBHOOK_SECRET;
      if (shared) headers["x-shared-secret"] = shared;
      await fetch(makeUrl, { method: "POST", headers, body: JSON.stringify({ provider: adapter.code, event, payloadHash }) });
    } catch (e) {
      console.error("[webhook] notify failed", e);
    }
  }

  return new Response("ok");
}
