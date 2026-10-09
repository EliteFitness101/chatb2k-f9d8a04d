import { createHash, createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent, audit } from "@/lib/events.server";
import { allocatePayment } from "@/lib/fulfillment.server";
import { raiseAlert } from "@/lib/alerts.server";

export type PaymentStatus = "created" | "authorized" | "paid" | "verified" | "fulfillment_started" | "completed" | "refunded" | "partially_refunded" | "reversed" | "disputed" | "failed";

export interface NormalizedEvent {
  eventKey: string;
  type: "paid" | "failed" | "refunded" | "reversed" | "disputed" | "ignored";
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

  const processingKey = createHash("sha256")
    .update(`${adapter.code}:${event.reference ?? ""}:${event.type}:${event.eventKey || payloadHash}`)
    .digest("hex");
  let processingClaimed = false;

  // Claim per provider event, not per payment reference. A payment can legitimately
  // receive distinct paid/refunded events, while repeated deliveries of one event stay idempotent.
  if (adapter.code === "paystack" && event.reference) {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("payment_event_processing")
      .select("id,status,attempt_count")
      .eq("paystack_ref", event.reference)
      .eq("event_key", processingKey)
      .maybeSingle();
    if (lookupError) return new Response("Processing ledger lookup failed", { status: 500 });

    if (existing) {
      if (existing.status !== "failed") return new Response("duplicate", { status: 200 });
      const { data: claimed, error: retryError } = await supabaseAdmin
        .from("payment_event_processing")
        .update({
          status: "processing",
          attempt_count: Number(existing.attempt_count ?? 1) + 1,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();
      if (retryError) return new Response("Processing retry claim failed", { status: 500 });
      if (!claimed) return new Response("duplicate", { status: 200 });
    } else {
      const { error: claimError } = await supabaseAdmin.from("payment_event_processing").insert({
        paystack_ref: event.reference,
        event_key: processingKey,
        event_type: event.type,
        status: "processing",
        attempt_count: 1,
        updated_at: new Date().toISOString(),
      });
      if (claimError?.code === "23505") return new Response("duplicate", { status: 200 });
      if (claimError) return new Response("Processing ledger failed", { status: 500 });
    }
    processingClaimed = true;
  }

  const { error: eventPersistError } = await supabaseAdmin.from("payment_events").upsert({
    event: event.type,
    payload: payload as never,
    paystack_ref: event.reference,
    processed: false,
    signature_verified: true,
    source: adapter.code,
  }, { onConflict: "paystack_ref,event", ignoreDuplicates: true });
  if (eventPersistError) {
    if (processingClaimed && event.reference) {
      await supabaseAdmin.from("payment_event_processing").update({
        status: "failed", last_error: "payment_events persistence failed", updated_at: new Date().toISOString(),
      }).eq("paystack_ref", event.reference).eq("event_key", processingKey);
    }
    console.error("[webhook] canonical payment_events upsert failed", eventPersistError);
    return new Response("Event persistence failed", { status: 500 });
  }

  try {
    if (event.type === "ignored" || !event.reference) {
      if (processingClaimed && event.reference) {
        await supabaseAdmin.from("payment_event_processing").update({
          status: "processed", processed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
        }).eq("paystack_ref", event.reference).eq("event_key", processingKey);
      }
      return new Response("ok");
    }

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
      await supabaseAdmin.from("payment_event_processing").update({ status: "failed", last_error: "payment processing failed", updated_at: new Date().toISOString() }).eq("paystack_ref", event.reference).eq("event_key", processingKey);
      await raiseAlert("critical", "payment", "Verified payment has no canonical ledger row", { reference: event.reference }, "payment", event.reference);
      return new Response("Payment record not found", { status: 422 });
    }

    const expectedAmount = Number(payment.amount);
    const expectedCurrency = String(payment.currency ?? "NGN").toUpperCase();
    const receivedAmount = amountMajor(event.amountMinor);
    const receivedCurrency = String(event.currency).toUpperCase();

    if (!Number.isFinite(expectedAmount) || Math.abs(expectedAmount - receivedAmount) > 0.000001 || expectedCurrency !== receivedCurrency) {
      await supabaseAdmin.from("payment_event_processing").update({ status: "failed", last_error: "payment processing failed", updated_at: new Date().toISOString() }).eq("paystack_ref", event.reference).eq("event_key", processingKey);
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
      await supabaseAdmin.from("payment_event_processing").update({ status: "failed", last_error: "payment processing failed", updated_at: new Date().toISOString() }).eq("paystack_ref", event.reference).eq("event_key", processingKey);
      await raiseAlert("critical", "payment", "Canonical payment finalization failed", { reference: event.reference, provider: adapter.code }, "payment", event.reference);
      return new Response("Payment finalization failed", { status: 500 });
    }

    const { error: paymentUpdateError } = await supabaseAdmin
      .from("payments")
      .update({ status: "success", paid_at: new Date().toISOString(), gateway_response: "webhook_verified", reconciled: false })
      .eq("paystack_ref", event.reference);
    if (paymentUpdateError) throw paymentUpdateError;

    const { error: revenueError } = await supabaseAdmin.from("revenue_events").upsert({
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
    }, { onConflict: "payment_reference" });
    if (revenueError) throw revenueError;

    const { data: telemetryEvent, error: telemetryError } = await supabaseAdmin
      .from("resofit_events")
      .upsert({
        event_name: "payment.succeeded",
        contract_version: "1.0",
        occurred_at: new Date().toISOString(),
        source_system: "paystack",
        adapter: adapter.code,
        idempotency_key: `paystack:${event.reference}:payment.succeeded`,
        correlation_id: event.reference,
        session_id: typeof meta.session_id === "string" ? meta.session_id : null,
        user_id: payment.user_id ?? null,
        anonymous_id: typeof meta.anonymous_id === "string" ? meta.anonymous_id : null,
        rsid,
        funnel_origin: funnelOrigin,
        utm: utm as never,
        payload: {
          payment_reference: event.reference,
          amount: receivedAmount,
          currency: receivedCurrency,
          product_sku: productSku,
          order_id: typeof meta.order_id === "string" ? meta.order_id : null,
        } as never,
      }, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (telemetryError) throw telemetryError;

    if (telemetryEvent?.id) {
      const { error: learningError } = await supabaseAdmin.from("chatb2k_learning_events").insert({
        platform: "resofit",
        source: "paystack_webhook",
        event_type: "payment.succeeded",
        topic: productSku ?? "payment",
        observation: {
          payment_reference: event.reference,
          amount: receivedAmount,
          currency: receivedCurrency,
          product_sku: productSku,
          rsid,
          funnel_origin: funnelOrigin,
        },
        confidence: 1,
        action: "verified_payment_recorded",
      });
      if (learningError) console.error("[webhook] payment learning event write failed", learningError);
    }

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
      await supabaseAdmin.from("payment_event_processing").update({ status: "failed", last_error: "fulfillment allocation failed", updated_at: new Date().toISOString() }).eq("paystack_ref", event.reference).eq("event_key", processingKey);
      return new Response("Payment verified; fulfillment allocation failed", { status: 500 });
    }
  } else if (event.type === "disputed") {
    await publishEvent("PaymentDisputed", "payment", event.reference, {
      provider: adapter.code, reference: event.reference, amount_minor: event.amountMinor, currency: event.currency, product_sku: productSku, rsid,
    });
    await audit("payment.disputed", "payment", event.reference, { provider: adapter.code, amount_minor: event.amountMinor, currency: event.currency });
    const { error: disputeLearningError } = await supabaseAdmin.from("chatb2k_learning_events").insert({
      platform: "resofit",
      source: "paystack_webhook",
      event_type: "payment.disputed",
      topic: productSku ?? "payment",
      observation: { payment_reference: event.reference, amount: amountMajor(event.amountMinor), currency: event.currency, product_sku: productSku, rsid, funnel_origin: funnelOrigin },
      confidence: 1,
      action: "payment_dispute_opened",
    });
    if (disputeLearningError) console.error("[webhook] dispute learning event write failed", disputeLearningError);
  } else if (event.type === "failed" || event.type === "refunded" || event.type === "reversed") {
    if ((event.type === "refunded" || event.type === "reversed") && !payment) {
      throw new Error(`Canonical payment record missing for ${event.type} event`);
    }

    let lifecycleStatus: "failed" | "refunded" | "partially_refunded" | "reversed" = event.type;
    if (event.type === "refunded") {
      const refundAmount = amountMajor(event.amountMinor);
      if (!Number.isFinite(refundAmount) || refundAmount <= 0) throw new Error("Refund event is missing a valid amount");

      const { data: revenueRecord, error: revenueLookupError } = await supabaseAdmin
        .from("revenue_events")
        .select("amount")
        .eq("payment_reference", event.reference)
        .maybeSingle();
      if (revenueLookupError) throw revenueLookupError;
      if (!revenueRecord) throw new Error("Revenue ledger row missing for refund event");

      const currentNetRevenue = Number(revenueRecord.amount ?? 0);
      const remainingRevenue = Math.max(currentNetRevenue - refundAmount, 0);
      const partialRefund = remainingRevenue > 0;
      lifecycleStatus = partialRefund ? "partially_refunded" : "refunded";

      if (partialRefund) {
        const { error: revenueUpdateError } = await supabaseAdmin
          .from("revenue_events")
          .update({ amount: remainingRevenue, status: "success" })
          .eq("payment_reference", event.reference);
        if (revenueUpdateError) throw revenueUpdateError;

        const { error: paymentUpdateError } = await supabaseAdmin
          .from("payments")
          .update({ gateway_response: "webhook_partially_refunded", reconciled: true, reconciled_at: new Date().toISOString() })
          .eq("paystack_ref", event.reference);
        if (paymentUpdateError) throw paymentUpdateError;
      } else {
        const { error: paymentUpdateError } = await supabaseAdmin
          .from("payments")
          .update({ status: "refunded", gateway_response: "webhook_refunded", reconciled: true, reconciled_at: new Date().toISOString() })
          .eq("paystack_ref", event.reference);
        if (paymentUpdateError) throw paymentUpdateError;
        const { error: revenueUpdateError } = await supabaseAdmin
          .from("revenue_events")
          .update({ status: "refunded" })
          .eq("payment_reference", event.reference);
        if (revenueUpdateError) throw revenueUpdateError;
      }
    } else {
      const { error: paymentUpdateError } = await supabaseAdmin
        .from("payments")
        .update({ status: lifecycleStatus, gateway_response: `webhook_${lifecycleStatus}`, reconciled: true, reconciled_at: new Date().toISOString() })
        .eq("paystack_ref", event.reference);
      if (paymentUpdateError) throw paymentUpdateError;
      if (event.type === "reversed") {
        const { error: revenueUpdateError } = await supabaseAdmin
          .from("revenue_events")
          .update({ status: "reversed" })
          .eq("payment_reference", event.reference);
        if (revenueUpdateError) throw revenueUpdateError;
      }
    }

    const eventName = lifecycleStatus === "partially_refunded"
      ? "PaymentPartiallyRefunded"
      : lifecycleStatus === "refunded"
        ? "PaymentRefunded"
        : lifecycleStatus === "reversed"
          ? "PaymentReversed"
          : "PaymentFailed";
    await publishEvent(eventName, "payment", event.reference, {
      provider: adapter.code, reference: event.reference, amount_minor: event.amountMinor, currency: event.currency, rsid, lifecycle_status: lifecycleStatus,
    });
    await audit(`payment.${lifecycleStatus}`, "payment", event.reference, { provider: adapter.code, amount_minor: event.amountMinor, currency: event.currency });

    if (lifecycleStatus !== "failed") {
      const { error: lifecycleLearningError } = await supabaseAdmin.from("chatb2k_learning_events").insert({
        platform: "resofit",
        source: "paystack_webhook",
        event_type: `payment.${lifecycleStatus}`,
        topic: productSku ?? "payment",
        observation: { payment_reference: event.reference, amount: amountMajor(event.amountMinor), currency: event.currency, product_sku: productSku, rsid, funnel_origin: funnelOrigin },
        confidence: 1,
        action: `payment_${lifecycleStatus}_recorded`,
      });
      if (lifecycleLearningError) console.error("[webhook] payment lifecycle learning event write failed", lifecycleLearningError);
    }
  }

  if (adapter.code === "paystack" && event.reference) {
    await supabaseAdmin.from("payment_event_processing").update({
      status: "processed", processed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq("paystack_ref", event.reference).eq("event_key", processingKey);
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
  } catch (error) {
    if (processingClaimed && event.reference) {
      await supabaseAdmin.from("payment_event_processing").update({
        status: "failed",
        last_error: error instanceof Error ? error.message.slice(0, 500) : "unexpected webhook processing error",
        updated_at: new Date().toISOString(),
      }).eq("paystack_ref", event.reference).eq("event_key", processingKey);
    }
    console.error("[webhook] processing failed", { provider: adapter.code, eventType: event.type, payloadHash });
    return new Response("Webhook processing failed", { status: 500 });
  }
}
