import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent, audit } from "@/lib/events.server";
import { raiseAlert } from "@/lib/alerts.server";
import { startSla, completeSla } from "@/lib/ops/sla.server";
import type { SlaType } from "@/lib/ops/rules";

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

/**
 * Hub Assignment Engine.
 * Order Created → Region → Eligible Hubs → Inventory → Allocate → Fulfillment
 * Order → Dispatch Queue. Every transition writes an immutable audit record.
 */
export async function allocateOrder(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, reference, customer_country, assigned_hub_id, order_items(sku, quantity)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false as const, error: "Order not found" };

  const country = (order.customer_country ?? "NG").toUpperCase();

  // 1. Region → eligible hubs (preferred country first, then global HQ).
  const { data: hubs } = await supabaseAdmin
    .from("hubs")
    .select("id, name, tier, country_code")
    .order("sort_order", { nullsFirst: false });
  const eligible = (hubs ?? []).sort((a, b) => {
    const rank = (h: { country_code: string; tier: string }) =>
      (h.country_code === country ? 0 : 2) + (h.tier === "global_hq" ? 1 : 0);
    return rank(a) - rank(b);
  });
  if (eligible.length === 0) {
    await raiseAlert("critical", "fulfillment", "No hubs configured for allocation", {
      order_id: orderId,
    }, "order", orderId);
    return { ok: false as const, error: "No hubs configured" };
  }

  const items = (order.order_items ?? []) as { sku: string; quantity: number }[];
  const physical = items.filter((i) => i.sku.startsWith("RES-IRON") || i.sku.startsWith("RES-BENCH") || i.sku.startsWith("RES-BUNDLE"));

  // 2. Inventory check across eligible hubs.
  let chosen = eligible[0];
  if (physical.length > 0) {
    for (const hub of eligible) {
      const { data: stock } = await supabaseAdmin
        .from("inventory_items")
        .select("sku, on_hand, reserved")
        .eq("hub_id", hub.id);
      const ok = physical.every((line) => {
        const row = (stock ?? []).find((s) => s.sku === line.sku);
        return row && row.on_hand - row.reserved >= line.quantity;
      });
      if (ok) {
        chosen = hub;
        break;
      }
    }
  }

  // 3. Reserve inventory + ledger.
  for (const line of physical) {
    const { data: row } = await supabaseAdmin
      .from("inventory_items")
      .select("id, reserved")
      .eq("hub_id", chosen.id)
      .eq("sku", line.sku)
      .maybeSingle();
    if (row) {
      await supabaseAdmin
        .from("inventory_items")
        .update({ reserved: row.reserved + line.quantity })
        .eq("id", row.id);
    }
    if (!row) {
      await raiseAlert(
        "warning",
        "inventory",
        `No stock record for ${line.sku} at allocated hub`,
        { hub_id: chosen.id, sku: line.sku },
        "order",
        order.id,
      );
    }
    await supabaseAdmin.from("inventory_ledger").insert({
      hub_id: chosen.id,
      sku: line.sku,
      delta: -line.quantity,
      reason: "reserved_for_order",
      order_id: order.id,
    });
  }
  if (physical.length > 0) {
    await publishEvent("InventoryReserved", "order", order.id, {
      hub_id: chosen.id,
      lines: physical,
    });
  }
  // Inventory reservation SLA closes once stock is reserved (or when there is
  // nothing physical to reserve).
  await completeSla("inventory_reservation", "order", order.id);

  // 4. Fulfillment order + dispatch queue entry.
  await supabaseAdmin.from("orders").update({ assigned_hub_id: chosen.id }).eq("id", order.id);

  const { data: existing } = await supabaseAdmin
    .from("fulfillment_orders")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();

  let fulfillmentId = existing?.id ?? null;
  if (!fulfillmentId) {
    const { data: created } = await supabaseAdmin
      .from("fulfillment_orders")
      .insert({ order_id: order.id, hub_id: chosen.id, status: "allocated" })
      .select("id")
      .single();
    fulfillmentId = created?.id ?? null;
  } else {
    await supabaseAdmin
      .from("fulfillment_orders")
      .update({ hub_id: chosen.id, status: "allocated" })
      .eq("id", fulfillmentId);
  }

  if (fulfillmentId) {
    await supabaseAdmin.from("fulfillment_events").insert({
      fulfillment_order_id: fulfillmentId,
      from_status: existing ? "pending" : null,
      to_status: "allocated",
      detail: { hub_id: chosen.id, hub_name: chosen.name } as never,
    });
  }

  await publishEvent("FulfillmentAllocated", "order", order.id, {
    hub_id: chosen.id,
    hub_name: chosen.name,
    fulfillment_order_id: fulfillmentId,
  });
  await audit("fulfillment.allocated", "order", order.reference, {
    hub_id: chosen.id,
  });

  // Hub assignment done → picking clock starts on the fulfillment order.
  await completeSla("hub_assignment", "order", order.id);
  if (fulfillmentId) {
    await startSla("picking", "fulfillment_order", fulfillmentId, {
      order_id: order.id,
      hub_id: chosen.id,
    });
  }

  return { ok: true as const, hubId: chosen.id, fulfillmentId };
}

/**
 * Fulfillment lifecycle → SLA transitions. Entering a status completes the
 * previous stage timer and starts the next one. Fully automatic.
 */
const SLA_ON_ENTER: Partial<Record<FulfillmentStatus, { complete: SlaType[]; start: SlaType | null }>> = {
  picking: { complete: [], start: "picking" },
  packed: { complete: ["picking"], start: "packing" },
  ready_for_dispatch: { complete: ["packing"], start: "dispatch" },
  shipped: { complete: ["packing", "dispatch"], start: "delivery" },
  delivered: { complete: ["delivery"], start: null },
  completed: { complete: ["picking", "packing", "dispatch", "delivery"], start: null },
  exception: { complete: [], start: null },
};

/** Advance a fulfillment order, writing an immutable transition record. */
export async function transitionFulfillment(
  fulfillmentId: string,
  to: FulfillmentStatus,
  actorId: string | null = null,
  detail: Record<string, unknown> = {},
) {
  const { data: current } = await supabaseAdmin
    .from("fulfillment_orders")
    .select("id, status, order_id")
    .eq("id", fulfillmentId)
    .maybeSingle();
  if (!current) return { ok: false as const, error: "Fulfillment order not found" };

  await supabaseAdmin
    .from("fulfillment_orders")
    .update({ status: to })
    .eq("id", fulfillmentId);
  await supabaseAdmin.from("fulfillment_events").insert({
    fulfillment_order_id: fulfillmentId,
    from_status: current.status,
    to_status: to,
    actor_id: actorId,
    detail: detail as never,
  });
  await publishEvent("FulfillmentTransitioned", "fulfillment_order", fulfillmentId, {
    from: current.status,
    to,
  });

  const slaPlan = SLA_ON_ENTER[to];
  if (slaPlan) {
    for (const type of slaPlan.complete) {
      await completeSla(type, "fulfillment_order", fulfillmentId);
    }
    if (slaPlan.start) {
      await startSla(slaPlan.start, "fulfillment_order", fulfillmentId, {
        order_id: current.order_id,
      });
    }
  }

  return { ok: true as const };
}