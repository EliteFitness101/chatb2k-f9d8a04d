import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AdminPermission, AdminRole, AlertStatus } from "@/lib/rbac";

export interface Denied {
  ok: false;
  error: string;
}
export type Result<T> = ({ ok: true } & T) | Denied;

export interface AlertRow {
  id: string;
  level: string;
  category: string;
  title: string;
  status: string;
  entity: string | null;
  entity_id: string | null;
  created_at: string;
}

/** Roles + effective permissions of the signed-in operator. */
export const getAdminCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ roles: AdminRole[]; permissions: AdminPermission[]; legacyAdmin: boolean }> => {
      const { loadCapabilities } = await import("@/lib/admin-guard.server");
      return loadCapabilities(context.supabase, context.userId);
    },
  );

/** Domain 1 — Global Overview. */
export const getGlobalOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "analytics.read")))
      return { ok: false as const, error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const iso = since.toISOString();

    const [revenue, orders, alerts, fulfil, stock, rejected, assessments] = await Promise.all([
      supabaseAdmin.from("revenue_events").select("amount_minor, status").gte("occurred_at", iso),
      supabaseAdmin.from("orders").select("status").gte("created_at", iso),
      supabaseAdmin
        .from("ops_alerts")
        .select("id, level, category, title, status, entity, entity_id, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin.from("fulfillment_orders").select("status"),
      supabaseAdmin.from("inventory_items").select("sku, on_hand, reserved, reorder_level"),
      supabaseAdmin
        .from("domain_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "WebhookRejected")
        .gte("created_at", iso),
      supabaseAdmin.from("assessments").select("status").gte("created_at", iso),
    ]);

    const revRows = revenue.data ?? [];
    const gross = revRows.reduce((s, r) => s + Number(r.amount_minor ?? 0), 0);
    const refunded = revRows
      .filter((r) => r.status === "refunded" || r.status === "chargeback")
      .reduce((s, r) => s + Number(r.amount_minor ?? 0), 0);

    const fulfilCounts: Record<string, number> = {};
    for (const f of fulfil.data ?? []) fulfilCounts[f.status] = (fulfilCounts[f.status] ?? 0) + 1;

    const lowStock = (stock.data ?? []).filter(
      (s) => s.on_hand - s.reserved <= s.reorder_level,
    ).length;

    return {
      ok: true as const,
      net_revenue_minor: gross - refunded,
      gross_revenue_minor: gross,
      refunded_minor: refunded,
      orders_today: (orders.data ?? []).length,
      paid_orders_today: (orders.data ?? []).filter((o) => o.status === "paid").length,
      assessments_today: (assessments.data ?? []).length,
      completed_assessments_today: (assessments.data ?? []).filter((a) => a.status === "completed")
        .length,
      open_alerts: (alerts.data ?? []) as AlertRow[],
      fulfillment_by_status: Object.entries(fulfilCounts).map(([status, count]) => ({
        status,
        count,
      })),
      low_stock_skus: lowStock,
      webhook_rejections_today: rejected.count ?? 0,
    };
  });

/** Domain 3 — Orders console. */
export const getOrdersConsole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "orders.read")))
      return { ok: false as const, error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data } = await supabaseAdmin
      .from("orders")
      .select(
        "id, reference, status, rail, currency, amount_minor, customer_email, customer_country, created_at, hubs:assigned_hub_id(name)",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    const rows = (data ?? []).map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      rail: o.rail,
      currency: o.currency,
      amount_minor: Number(o.amount_minor ?? 0),
      customer_email: o.customer_email,
      customer_country: o.customer_country,
      created_at: o.created_at,
      hub_name: (o.hubs as { name: string } | null)?.name ?? null,
    }));

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

    return {
      ok: true as const,
      rows,
      by_status: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
    };
  });

/** Domain 4 — Payments console. */
export const getPaymentsConsole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "payments.read")))
      return { ok: false as const, error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [providers, payments, events] = await Promise.all([
      supabaseAdmin
        .from("payment_providers")
        .select("code, display_name, enabled, live, supported_currencies")
        .order("sort_order"),
      supabaseAdmin
        .from("payments")
        .select("id, reference, provider, status, currency, amount_minor, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("payment_events")
        .select("id, provider, event_type, reference, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const rows = (payments.data ?? []).map((p) => ({
      ...p,
      amount_minor: Number(p.amount_minor ?? 0),
    }));
    const byProvider: Record<string, { count: number; amount_minor: number; failed: number }> = {};
    for (const p of rows) {
      const b = byProvider[p.provider] ?? { count: 0, amount_minor: 0, failed: 0 };
      b.count += 1;
      b.amount_minor += p.amount_minor;
      if (p.status === "failed") b.failed += 1;
      byProvider[p.provider] = b;
    }

    return {
      ok: true as const,
      providers: providers.data ?? [],
      rows,
      recent_events: events.data ?? [],
      by_provider: Object.entries(byProvider).map(([provider, v]) => ({ provider, ...v })),
    };
  });

/** Domain 5 — Inventory. */
export const getInventoryConsole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "inventory.read")))
      return { ok: false as const, error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [items, ledger] = await Promise.all([
      supabaseAdmin
        .from("inventory_items")
        .select("id, sku, on_hand, reserved, reorder_level, hubs:hub_id(name, tier)")
        .order("sku"),
      supabaseAdmin
        .from("inventory_ledger")
        .select("id, sku, delta, reason, created_at, hubs:hub_id(name)")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const rows = (items.data ?? []).map((i) => ({
      id: i.id,
      sku: i.sku,
      on_hand: i.on_hand,
      reserved: i.reserved,
      available: i.on_hand - i.reserved,
      reorder_level: i.reorder_level,
      hub_name: (i.hubs as { name: string } | null)?.name ?? "—",
      hub_tier: (i.hubs as { tier: string } | null)?.tier ?? "—",
      low: i.on_hand - i.reserved <= i.reorder_level,
    }));

    return {
      ok: true as const,
      rows,
      low_count: rows.filter((r) => r.low).length,
      ledger: (ledger.data ?? []).map((l) => ({
        id: l.id,
        sku: l.sku,
        delta: l.delta,
        reason: l.reason,
        created_at: l.created_at,
        hub_name: (l.hubs as { name: string } | null)?.name ?? "—",
      })),
    };
  });

/** Domain 6 — Fulfillment hubs + dispatch queue. */
export const getFulfillmentConsole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "inventory.read")))
      return { ok: false as const, error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [hubs, queue, events] = await Promise.all([
      supabaseAdmin.from("hubs").select("id, name, tier, city, country_code").order("sort_order"),
      supabaseAdmin
        .from("fulfillment_orders")
        .select("id, status, tracking_ref, created_at, orders:order_id(reference, customer_country), hubs:hub_id(name)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("fulfillment_events")
        .select("id, from_status, to_status, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const rows = (queue.data ?? []).map((f) => ({
      id: f.id,
      status: f.status,
      tracking_ref: f.tracking_ref,
      created_at: f.created_at,
      reference: (f.orders as { reference: string } | null)?.reference ?? "—",
      country: (f.orders as { customer_country: string | null } | null)?.customer_country ?? "—",
      hub_name: (f.hubs as { name: string } | null)?.name ?? "Unassigned",
    }));

    const byHub: Record<string, number> = {};
    for (const r of rows) byHub[r.hub_name] = (byHub[r.hub_name] ?? 0) + 1;

    return {
      ok: true as const,
      hubs: hubs.data ?? [],
      rows,
      by_hub: Object.entries(byHub).map(([hub, count]) => ({ hub, count })),
      recent_events: events.data ?? [],
    };
  });

/** Domain 7 — Customer intelligence. */
export const getCustomerIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "customers.read")))
      return { ok: false as const, error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profiles, revenue, leads] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, display_name, tier, xp, points, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("revenue_events")
        .select("email, amount_minor, status, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("candy_leads")
        .select("id, email, goal, activity, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const ltv = new Map<string, { amount_minor: number; orders: number }>();
    for (const r of revenue.data ?? []) {
      if (r.status === "refunded" || r.status === "chargeback") continue;
      const email = (r.email ?? "").toLowerCase();
      if (!email) continue;
      const e = ltv.get(email) ?? { amount_minor: 0, orders: 0 };
      e.amount_minor += Number(r.amount_minor ?? 0);
      e.orders += 1;
      ltv.set(email, e);
    }
    const top_customers = [...ltv.entries()]
      .map(([email, v]) => ({ email, ...v }))
      .sort((a, b) => b.amount_minor - a.amount_minor)
      .slice(0, 20);

    const tiers: Record<string, number> = {};
    for (const p of profiles.data ?? []) tiers[p.tier] = (tiers[p.tier] ?? 0) + 1;

    return {
      ok: true as const,
      member_count: (profiles.data ?? []).length,
      by_tier: Object.entries(tiers).map(([tier, count]) => ({ tier, count })),
      top_customers,
      repeat_buyers: [...ltv.values()].filter((v) => v.orders > 1).length,
      distinct_buyers: ltv.size,
      leads: leads.data ?? [],
    };
  });

/** Domain 8 — ChatB2K intelligence. */
export const getChatB2KIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "analytics.read")))
      return { ok: false as const, error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [assessments, results, profiles, upsells, funnel] = await Promise.all([
      supabaseAdmin.from("assessments").select("id, status, created_at").limit(1000),
      supabaseAdmin
        .from("recommendation_results")
        .select("primary_program_sku, membership_sku, upsell_score, confidence_score, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin.from("health_profiles").select("primary_goal, experience_level, equipment_access, budget_band").limit(1000),
      supabaseAdmin
        .from("upsell_events")
        .select("offer_sku, trigger, accepted, amount_minor, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabaseAdmin
        .from("funnel_events")
        .select("event_name, rsid")
        .order("occurred_at", { ascending: false })
        .limit(5000),
    ]);

    const all = assessments.data ?? [];
    const completed = all.filter((a) => a.status === "completed").length;
    const recs = results.data ?? [];

    const tally = (rows: { [k: string]: unknown }[], key: string) => {
      const m: Record<string, number> = {};
      for (const r of rows) {
        const v = (r[key] as string | null) ?? "(unset)";
        m[v] = (m[v] ?? 0) + 1;
      }
      return Object.entries(m)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    };

    const avg = (nums: number[]) =>
      nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;

    // Upsell / bundle conversion
    const upsellRows = upsells.data ?? [];
    const acceptedUpsells = upsellRows.filter((u) => u.accepted);
    const byOffer: Record<string, { offered: number; accepted: number; amount_minor: number }> = {};
    for (const u of upsellRows) {
      const sku = u.offer_sku ?? "(unset)";
      const b = byOffer[sku] ?? { offered: 0, accepted: 0, amount_minor: 0 };
      b.offered += 1;
      if (u.accepted) {
        b.accepted += 1;
        b.amount_minor += Number(u.amount_minor ?? 0);
      }
      byOffer[sku] = b;
    }

    // Drop-off funnel (distinct visitors per step)
    const STEPS: { key: string; label: string }[] = [
      { key: "chatb2k_view", label: "Landed on ChatB2K" },
      { key: "assessment_started", label: "Assessment started" },
      { key: "assessment_completed", label: "Assessment completed" },
      { key: "recommendation_viewed", label: "Recommendation viewed" },
      { key: "checkout_started", label: "Checkout started" },
      { key: "purchase", label: "Purchase" },
    ];
    const perStep = new Map<string, Set<string>>();
    for (const f of funnel.data ?? []) {
      const set = perStep.get(f.event_name) ?? new Set<string>();
      set.add(f.rsid ?? "anon");
      perStep.set(f.event_name, set);
    }
    let prevCount: number | null = null;
    const funnel_steps = STEPS.map((s) => {
      const count = perStep.get(s.key)?.size ?? 0;
      const drop_off = prevCount && prevCount > 0 ? 1 - count / prevCount : 0;
      const row = { key: s.key, label: s.label, count, drop_off };
      prevCount = count;
      return row;
    });

    return {
      ok: true as const,
      total_assessments: all.length,
      completed_assessments: completed,
      completion_rate: all.length > 0 ? completed / all.length : 0,
      avg_confidence: avg(recs.map((r) => Number(r.confidence_score ?? 0))),
      avg_upsell: avg(recs.map((r) => Number(r.upsell_score ?? 0))),
      upsell_offered: upsellRows.length,
      upsell_accepted: acceptedUpsells.length,
      upsell_conversion:
        upsellRows.length > 0 ? acceptedUpsells.length / upsellRows.length : 0,
      upsell_revenue_minor: acceptedUpsells.reduce((s, u) => s + Number(u.amount_minor ?? 0), 0),
      by_offer: Object.entries(byOffer)
        .map(([sku, v]) => ({ sku, ...v, rate: v.offered > 0 ? v.accepted / v.offered : 0 }))
        .sort((a, b) => b.offered - a.offered),
      funnel_steps,
      by_program: tally(recs, "primary_program_sku"),
      by_membership: tally(recs, "membership_sku"),
      by_goal: tally(profiles.data ?? [], "primary_goal"),
      by_experience: tally(profiles.data ?? [], "experience_level"),
      by_equipment: tally(profiles.data ?? [], "equipment_access"),
      by_budget: tally(profiles.data ?? [], "budget_band"),
    };
  });

/** Domain 9 — Compliance & audit. */
export const getComplianceFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "audit.read")))
      return { ok: false as const, error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [audits, events, alerts] = await Promise.all([
      supabaseAdmin
        .from("audit_logs")
        .select("id, action, entity, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("domain_events")
        .select("id, event_type, aggregate, aggregate_id, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("ops_alerts")
        .select("id, level, category, title, status, entity, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      ok: true as const,
      audits: audits.data ?? [],
      events: events.data ?? [],
      alerts: (alerts.data ?? []) as AlertRow[],
    };
  });

/** Acknowledge or resolve an operational alert. */
export const setAlertStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "acknowledged", "resolved"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { hasPermission } = await import("@/lib/admin-guard.server");
    if (!(await hasPermission(context.supabase, context.userId, "audit.read")))
      return { ok: false as const, error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const status = data.status as AlertStatus;
    const { error } = await supabaseAdmin
      .from("ops_alerts")
      .update({
        status,
        assigned_to: context.userId,
        acknowledged_at: status === "acknowledged" ? new Date().toISOString() : null,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    const { audit } = await import("@/lib/events.server");
    await audit(`alert.${status}`, "ops_alert", data.id, {}, context.userId);
    return { ok: true as const };
  });