import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent, audit } from "@/lib/events.server";
import { raiseAlert } from "@/lib/alerts.server";

export const FULFILLMENT_LIFECYCLE = [
  "pending",
  "allocated",
  "picking",
  "packed",
  "ready_for_dispatch",
  "shipped",
  "delivered",
  "completed",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_LIFECYCLE)[number] | "exception";

type AllocationContext = {
  countryCode?: string;
  hubCode?: string;
  customerEmail?: string;
  items?: { sku: string; quantity: number; productId?: string }[];
};

const PHYSICAL_SKU = /^(RES-IRON|RES-BENCH|RES-BUNDLE)/i;

function candidateHubs(countryCode: string) {
  const cc = countryCode.toUpperCase();
  const configured = [
    ["NG", process.env.HUB_GLOBAL_HQ ?? process.env.HUB_LAGOS ?? "Lagos,NG"],
    ["US", process.env.HUB_NEW_YORK ?? "New York,US"],
    ["CA", process.env.HUB_OTTAWA ?? "Ottawa,CA"],
    ["GB", process.env.HUB_LONDON ?? "London,GB"],
    ["AE", process.env.HUB_DUBAI ?? "Dubai,AE"],
    ["ZA", process.env.HUB_JOHANNESBURG ?? "Johannesburg,ZA"],
  ] as const;
  const preferred = configured.filter(([code]) => code === cc);
  const rest = configured.filter(([code]) => code !== cc && code !== "NG");
  return [...preferred, ...rest, configured.find(([code]) => code === "NG")!];
}

/** Canonical v3.0.1 fulfillment projection. Payment is the financial anchor. */
export async function allocatePayment(paymentId: string, context: AllocationContext = {}) {
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("payments")
    .select("id, paystack_ref, user_id, customer_email, amount, currency, status, product_sku, order_id, rsid")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError || !payment) return { ok: false as const, error: "Payment not found" };
  if (payment.status !== "success" && payment.status !== "paid") return { ok: false as const, error: "Payment is not verified" };

  const paymentReference = payment.paystack_ref ?? payment.order_id ?? payment.id;
  const { data: existing } = await supabaseAdmin
    .from("resofit_fulfillment_orders")
    .select("id, status, hub_code")
    .eq("payment_reference", paymentReference)
    .maybeSingle();
  if (existing) return { ok: true as const, fulfillmentId: existing.id, hubCode: existing.hub_code, deduplicated: true };

  const items = (context.items ?? (payment.product_sku ? [{ sku: payment.product_sku, quantity: 1 }] : []))
    .filter((item) => PHYSICAL_SKU.test(item.sku));

  if (items.length === 0) {
    await publishEvent("FulfillmentAllocated", "payment", payment.id, {
      payment_reference: paymentReference,
      mode: "digital",
      status: "completed",
      rsid: payment.rsid,
    });
    return { ok: true as const, fulfillmentId: null, mode: "digital" as const };
  }

  const country = (context.countryCode ?? "NG").toUpperCase();
  const hubs = candidateHubs(country);
  let chosen: string | null = context.hubCode ?? null;

  if (!chosen) {
    for (const [, hubCode] of hubs) {
      const { data: stock } = await supabaseAdmin
        .from("resofit_hub_inventory")
        .select("sku, on_hand, reserved")
        .eq("hub_code", hubCode);
      const available = items.every((line) => {
        const row = (stock ?? []).find((s) => s.sku === line.sku);
        return Boolean(row && row.on_hand - row.reserved >= line.quantity);
      });
      if (available) { chosen = hubCode; break; }
    }
  }

  if (!chosen) {
    await raiseAlert("critical", "fulfillment", "No eligible hub has sufficient inventory", {
      payment_id: payment.id, payment_reference: paymentReference, country, items,
    }, "payment", payment.id);
    const { data: blocked } = await supabaseAdmin
      .from("resofit_fulfillment_orders")
      .insert({
        payment_id: payment.id,
        payment_reference: paymentReference,
        customer_id: payment.user_id,
        customer_email: context.customerEmail ?? payment.customer_email,
        status: "exception",
        currency: payment.currency ?? "NGN",
        total_amount: payment.amount,
        metadata: { country, items, reason: "inventory_gap" },
      })
      .select("id")
      .single();
    if (blocked) await publishEvent("FulfillmentTransitioned", "fulfillment_order", blocked.id, { from: "pending", to: "exception", reason: "inventory_gap" });
    return { ok: false as const, error: "No hub has sufficient inventory", exception: true };
  }

  // Physical fulfillment is created and all inventory is reserved in one
  // database transaction. If any SKU cannot be reserved, the whole operation
  // rolls back, preventing partial fulfillment state.
  const { data: fulfillmentId, error: allocationError } = await supabaseAdmin.rpc("create_resofit_fulfillment_atomic", {
    p_payment_id: payment.id,
    p_payment_reference: paymentReference,
    p_customer_id: payment.user_id,
    p_customer_email: context.customerEmail ?? payment.customer_email,
    p_currency: payment.currency ?? "NGN",
    p_total_amount: payment.amount,
    p_hub_code: chosen,
    p_country: country,
    p_items: items,
  });

  if (allocationError || !fulfillmentId) {
    await raiseAlert("critical", "fulfillment", "Atomic fulfillment allocation failed", {
      payment_id: payment.id, payment_reference: paymentReference, country, hub_code: chosen, items,
      error: allocationError?.message,
    }, "payment", payment.id);
    return { ok: false as const, error: allocationError?.message ?? "Atomic fulfillment allocation failed", exception: true };
  }

  await publishEvent("InventoryReserved", "fulfillment_order", fulfillmentId, { hub_code: chosen, items, payment_id: payment.id, rsid: payment.rsid });
  await publishEvent("FulfillmentAllocated", "payment", payment.id, { fulfillment_order_id: fulfillmentId, hub_code: chosen, rsid: payment.rsid });
  await audit("fulfillment.allocated", "fulfillment_order", fulfillmentId, { hub_code: chosen, payment_reference: paymentReference });

  return { ok: true as const, fulfillmentId, hubCode: chosen, deduplicated: false };
}

/** Backward-compatible entry point: order IDs are resolved through payments.order_id. */
export async function allocateOrder(orderId: string, context: AllocationContext = {}) {
  const { data: payment } = await supabaseAdmin.from("payments").select("id").eq("order_id", orderId).maybeSingle();
  if (!payment) return { ok: false as const, error: "Payment for order not found" };
  return allocatePayment(payment.id, context);
}

export async function transitionFulfillment(
  fulfillmentId: string,
  to: FulfillmentStatus,
  actorId: string | null = null,
  detail: Record<string, unknown> = {},
) {
  const { data: current } = await supabaseAdmin
    .from("resofit_fulfillment_orders")
    .select("id, status, payment_id")
    .eq("id", fulfillmentId)
    .maybeSingle();
  if (!current) return { ok: false as const, error: "Fulfillment order not found" };
  if (current.status === to) return { ok: true as const, deduplicated: true };

  await supabaseAdmin.from("resofit_fulfillment_orders").update({ status: to, updated_at: new Date().toISOString() }).eq("id", fulfillmentId);
  await supabaseAdmin.from("resofit_fulfillment_events").insert({
    fulfillment_order_id: fulfillmentId, from_status: current.status, to_status: to, actor_id: actorId, detail,
  });
  await publishEvent("FulfillmentTransitioned", "fulfillment_order", fulfillmentId, { from: current.status, to, ...detail });
  await audit("fulfillment.transition", "fulfillment_order", fulfillmentId, { from: current.status, to, ...detail }, actorId);
  return { ok: true as const };
}
