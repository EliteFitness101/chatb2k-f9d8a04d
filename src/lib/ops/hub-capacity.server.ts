import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent } from "@/lib/events.server";
import { ensureTask } from "@/lib/ops/tasks.server";
import {
  recommendReassignments,
  utilizationFor,
  type HubCapacityMetrics,
} from "@/lib/ops/rules";

const ACTIVE_STATUSES = ["allocated", "picking", "packed", "ready_for_dispatch"];
const BACKLOG_STATUSES = ["packed", "ready_for_dispatch"];

/** Compute live capacity metrics for every hub. */
export async function computeHubCapacity(): Promise<HubCapacityMetrics[]> {
  const [hubs, stock, fulfil] = await Promise.all([
    supabaseAdmin.from("hubs").select("id, name").order("sort_order", { nullsFirst: false }),
    supabaseAdmin.from("inventory_items").select("hub_id, on_hand, reserved"),
    supabaseAdmin
      .from("fulfillment_orders")
      .select("hub_id, status, created_at, updated_at")
      .limit(2000),
  ]);

  return (hubs.data ?? []).map((h) => {
    const items = (stock.data ?? []).filter((s) => s.hub_id === h.id);
    const rows = (fulfil.data ?? []).filter((f) => f.hub_id === h.id);
    const active = rows.filter((f) => ACTIVE_STATUSES.includes(f.status));
    const done = rows.filter((f) => f.status === "completed" || f.status === "delivered");
    const durations = done
      .map((f) => new Date(f.updated_at).getTime() - new Date(f.created_at).getTime())
      .filter((d) => d > 0);

    return {
      hub_id: h.id,
      hub_name: h.name,
      available_units: items.reduce((s, i) => s + Math.max(0, i.on_hand - i.reserved), 0),
      pending_orders: rows.filter((f) => f.status === "pending" || f.status === "allocated").length,
      active_workload: active.length,
      dispatch_backlog: rows.filter((f) => BACKLOG_STATUSES.includes(f.status)).length,
      utilization: utilizationFor(active.length),
      avg_fulfillment_minutes:
        durations.length > 0
          ? Number((durations.reduce((s, d) => s + d, 0) / durations.length / 60_000).toFixed(1))
          : null,
    } satisfies HubCapacityMetrics;
  });
}

/** Worker step: snapshot capacity and open reassignment tasks when needed. */
export async function refreshHubCapacity() {
  const metrics = await computeHubCapacity();
  const recs = recommendReassignments(metrics);
  const day = new Date().toISOString().slice(0, 13); // hourly dedupe window
  let reassignments = 0;

  for (const m of metrics) {
    const rec = recs.find((r) => r.hub_id === m.hub_id);
    await supabaseAdmin.from("hub_capacity_snapshots").insert({
      hub_id: m.hub_id,
      available_units: m.available_units,
      pending_orders: m.pending_orders,
      active_workload: m.active_workload,
      dispatch_backlog: m.dispatch_backlog,
      utilization: m.utilization,
      avg_fulfillment_minutes: m.avg_fulfillment_minutes,
      recommendation: rec?.recommendation ?? "steady",
      detail: { reason: rec?.reason ?? "", target_hub_id: rec?.target_hub_id ?? null } as never,
    });

    if (rec?.recommendation === "reassign") {
      reassignments += 1;
      await ensureTask({
        type: "hub_reassignment",
        priority: "high",
        title: `Reassign load from ${m.hub_name}`,
        sourceEvent: "HubCapacityRefreshed",
        entity: "hub",
        entityId: m.hub_id,
        dedupeKey: `hub-reassign:${m.hub_id}:${day}`,
        detail: { reason: rec.reason, target_hub_id: rec.target_hub_id },
      });
    }
  }

  await publishEvent("HubCapacityRefreshed", "hub", null, { hubs: metrics.length });
  return { hubs: metrics.length, reassignments };
}