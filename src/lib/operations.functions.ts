import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TASK_STATUSES, ACTION_PERMISSIONS, type OpsAction } from "@/lib/ops/rules";

const denied = { ok: false as const, error: "Forbidden" };

/** Operations console — tasks, SLAs, hub capacity, recovery, escalations. */
export const getOperationsConsole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "orders.read"))) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeHubCapacity } = await import("@/lib/ops/hub-capacity.server");
    const { recoveryMetrics } = await import("@/lib/ops/recovery.server");
    const { recommendReassignments, slaState } = await import("@/lib/ops/rules");

    const [tasks, slas, alerts, policies, capacity, recovery] = await Promise.all([
      supabaseAdmin
        .from("ops_tasks")
        .select(
          "id, task_type, title, priority, status, assignee, due_at, entity, entity_id, source_event, created_at, completed_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("sla_timers")
        .select("id, sla_type, entity, entity_id, status, warn_at, due_at, completed_at, started_at")
        .order("due_at", { ascending: true })
        .limit(200),
      supabaseAdmin
        .from("ops_alerts")
        .select("id, level, category, title, status, entity, entity_id, created_at, escalation_level, task_id")
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("alert_escalation_policies")
        .select("category, level, auto_acknowledge, escalate_after_minutes, create_task, task_type, task_priority, active")
        .order("category"),
      computeHubCapacity(),
      recoveryMetrics(),
    ]);

    const now = new Date();
    const taskRows = tasks.data ?? [];
    const byStatus: Record<string, number> = {};
    for (const t of taskRows) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

    const slaRows = (slas.data ?? []).map((s) => ({ ...s, state: slaState(s, now) }));
    const recs = recommendReassignments(capacity);

    return {
      ok: true as const,
      tasks: taskRows,
      tasks_by_status: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      overdue_tasks: taskRows.filter(
        (t) => t.due_at && new Date(t.due_at) < now && !["completed", "cancelled"].includes(t.status),
      ).length,
      slas: slaRows,
      sla_breached: slaRows.filter((s) => s.state === "breached").length,
      sla_warning: slaRows.filter((s) => s.state === "warning").length,
      alerts: alerts.data ?? [],
      policies: policies.data ?? [],
      hubs: capacity.map((h) => ({
        ...h,
        ...(recs.find((r) => r.hub_id === h.hub_id) ?? { recommendation: "steady", reason: "", target_hub_id: null }),
      })),
      recovery: recovery.stats,
      recovery_rows: recovery.rows,
    };
  });

/** Audit trail of a single task. */
export const getTaskHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "orders.read"))) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: events } = await supabaseAdmin
      .from("ops_task_events")
      .select("id, from_status, to_status, actor_id, detail, created_at")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: false });
    return { ok: true as const, events: events ?? [] };
  });

async function guard(
  supabase: Parameters<typeof import("@/lib/admin-guard.server").hasPermission>[0],
  userId: string,
  action: OpsAction,
) {
  const { hasPermission } = await import("@/lib/admin-guard.server");
  return hasPermission(supabase, userId, ACTION_PERMISSIONS[action]);
}

/** Assign or reassign an operational task. */
export const assignOpsTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ taskId: z.string().uuid(), assignee: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await guard(context.supabase, context.userId, "assign_task"))) return denied;
    const { assignTask } = await import("@/lib/ops/tasks.server");
    return assignTask(data.taskId, data.assignee, context.userId);
  });

/** Move a task through its lifecycle. */
export const setOpsTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ taskId: z.string().uuid(), status: z.enum(TASK_STATUSES), note: z.string().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await guard(context.supabase, context.userId, "update_task"))) return denied;
    const { transitionTask } = await import("@/lib/ops/tasks.server");
    return transitionTask(data.taskId, data.status, context.userId, { note: data.note ?? null });
  });

/** Reassign a fulfillment order to a different hub. */
export const reassignFulfillmentHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ fulfillmentId: z.string().uuid(), hubId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await guard(context.supabase, context.userId, "reassign_hub"))) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishEvent, audit } = await import("@/lib/events.server");

    const { data: current } = await supabaseAdmin
      .from("fulfillment_orders")
      .select("id, hub_id, order_id, status")
      .eq("id", data.fulfillmentId)
      .maybeSingle();
    if (!current) return { ok: false as const, error: "Fulfillment order not found" };

    await supabaseAdmin.from("fulfillment_orders").update({ hub_id: data.hubId }).eq("id", current.id);
    await supabaseAdmin.from("orders").update({ assigned_hub_id: data.hubId }).eq("id", current.order_id);
    await supabaseAdmin.from("fulfillment_events").insert({
      fulfillment_order_id: current.id,
      from_status: current.status,
      to_status: current.status,
      actor_id: context.userId,
      detail: { from_hub: current.hub_id, to_hub: data.hubId, action: "reassign" } as never,
    });
    await publishEvent("HubReassigned", "fulfillment_order", current.id, {
      from_hub: current.hub_id,
      to_hub: data.hubId,
    });
    await audit("hub.reassigned", "fulfillment_order", current.id, { to_hub: data.hubId }, context.userId);
    return { ok: true as const };
  });

/** Manually adjust reserved stock for a SKU at a hub. */
export const reserveInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ itemId: z.string().uuid(), delta: z.number().int().min(-1000).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await guard(context.supabase, context.userId, "reserve_inventory"))) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishEvent, audit } = await import("@/lib/events.server");

    const { data: item } = await supabaseAdmin
      .from("inventory_items")
      .select("id, sku, hub_id, on_hand, reserved")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) return { ok: false as const, error: "Inventory item not found" };

    const reserved = Math.max(0, item.reserved + data.delta);
    if (reserved > item.on_hand) return { ok: false as const, error: "Reservation exceeds stock on hand" };

    await supabaseAdmin.from("inventory_items").update({ reserved }).eq("id", item.id);
    await supabaseAdmin.from("inventory_ledger").insert({
      hub_id: item.hub_id,
      sku: item.sku,
      delta: -data.delta,
      reason: "manual_reservation",
    });
    await publishEvent("InventoryAdjusted", "inventory_item", item.id, { delta: data.delta });
    await audit("inventory.reserved", "inventory_item", item.id, { delta: data.delta }, context.userId);
    return { ok: true as const, reserved };
  });

/** Re-run the processing pipeline for a stored webhook event. */
export const retryWebhookProcessing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await guard(context.supabase, context.userId, "retry_webhook"))) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishEvent, audit } = await import("@/lib/events.server");

    const { data: evt } = await supabaseAdmin
      .from("payment_events")
      .select("id, provider, reference, event_type")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!evt) return { ok: false as const, error: "Webhook event not found" };

    if (evt.event_type === "paid" && evt.reference) {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("reference", evt.reference)
        .maybeSingle();
      if (order) {
        const { allocateOrder } = await import("@/lib/fulfillment.server");
        await allocateOrder(order.id);
      }
    }
    await supabaseAdmin
      .from("payment_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", evt.id);
    await publishEvent("WebhookReprocessed", "payment_event", evt.id, { provider: evt.provider });
    await audit("webhook.retried", "payment_event", evt.id, {}, context.userId);
    return { ok: true as const };
  });

/** Re-sync a payment against its order and close recovery workflows. */
export const retryPaymentReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reference: z.string().min(3).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await guard(context.supabase, context.userId, "retry_payment_reconciliation"))) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishEvent, audit } = await import("@/lib/events.server");

    const [{ data: payment }, { data: order }] = await Promise.all([
      supabaseAdmin.from("payments").select("id, status, order_id").eq("reference", data.reference).maybeSingle(),
      supabaseAdmin.from("orders").select("id, status").eq("reference", data.reference).maybeSingle(),
    ]);
    if (!payment) return { ok: false as const, error: "Payment not found" };

    if (order && !payment.order_id) {
      await supabaseAdmin.from("payments").update({ order_id: order.id }).eq("id", payment.id);
    }
    if (payment.status === "paid" && order && order.status !== "paid") {
      await supabaseAdmin.from("orders").update({ status: "paid" }).eq("id", order.id);
      const { allocateOrder } = await import("@/lib/fulfillment.server");
      await allocateOrder(order.id);
    }
    if (payment.status === "paid") {
      const { markRecovered } = await import("@/lib/ops/recovery.server");
      await markRecovered(data.reference);
    }
    await publishEvent("PaymentReconciled", "payment", payment.id, { reference: data.reference });
    await audit("payment.reconciled", "payment", payment.id, { reference: data.reference }, context.userId);
    return { ok: true as const };
  });

/** Update a recovery workflow outcome. */
export const setRecoveryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["pending", "contacted", "recovered", "lost"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await guard(context.supabase, context.userId, "update_recovery"))) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishEvent, audit } = await import("@/lib/events.server");

    const { data: row } = await supabaseAdmin
      .from("recovery_workflows")
      .select("id, attempts, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: false as const, error: "Recovery workflow not found" };

    const { error } = await supabaseAdmin
      .from("recovery_workflows")
      .update({
        status: data.status,
        attempts: data.status === "contacted" ? row.attempts + 1 : row.attempts,
        last_attempt_at: new Date().toISOString(),
        recovered_at: data.status === "recovered" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };

    await publishEvent(
      data.status === "recovered" ? "RecoveryConverted" : "RecoveryContacted",
      "recovery",
      data.id,
      { status: data.status },
    );
    await audit(`recovery.${data.status}`, "recovery", data.id, {}, context.userId);
    return { ok: true as const };
  });