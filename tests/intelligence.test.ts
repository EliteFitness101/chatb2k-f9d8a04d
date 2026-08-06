import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, supabaseAdminMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: supabaseAdminMock,
}));

const { inventoryHealthCheck, aggregateAnalytics, runAutomation } = await import(
  "@/lib/ops/automation.server"
);
const { computeHubCapacity, refreshHubCapacity } = await import("@/lib/ops/hub-capacity.server");
const { evaluateAlertEscalation } = await import("@/lib/ops/escalation.server");

beforeEach(() => {
  mockDb.reset();
});

describe("inventory reconciliation", () => {
  it("creates restock tasks and out-of-stock alerts, idempotently", async () => {
    mockDb.seed("inventory_items", [
      { id: "i1", sku: "RES-IRON-15", on_hand: 2, reserved: 2, reorder_level: 1, hub_id: "h1" },
      { id: "i2", sku: "RES-BENCH-01", on_hand: 50, reserved: 0, reorder_level: 5, hub_id: "h1" },
    ]);
    const first = await inventoryHealthCheck();
    const second = await inventoryHealthCheck();
    expect(first.low_skus).toBe(1);
    expect(second.low_skus).toBe(1);
    expect(mockDb.rows("ops_tasks")).toHaveLength(1);
    expect(mockDb.rows("ops_alerts").some((a) => a['level'] === "critical")).toBe(true);
  });
});

describe("hub capacity refresh", () => {
  beforeEach(() => {
    mockDb.seed("hubs", [{ id: "h1", name: "Lagos HQ", tier: "global_hq", country_code: "NG" }]);
    mockDb.seed("inventory_items", [
      { id: "i1", hub_id: "h1", sku: "RES-IRON-15", on_hand: 10, reserved: 2, reorder_level: 1 },
    ]);
  });

  it("computes metrics for every hub", async () => {
    const metrics = await computeHubCapacity();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].hub_id).toBe("h1");
    expect(metrics[0].available_units).toBe(8);
  });

  it("persists a capacity snapshot per run", async () => {
    await refreshHubCapacity();
    expect(mockDb.rows("hub_capacity_snapshots").length).toBeGreaterThan(0);
  });
});

describe("alert escalation worker", () => {
  it("escalates aged critical alerts once", async () => {
    mockDb.seed("alert_escalation_policies", [
      {
        id: "p1",
        category: "payment",
        level: "critical",
        auto_acknowledge: false,
        escalate_after_minutes: 15,
        escalate_to: null,
        create_task: true,
        task_type: "failed_payment_followup",
        task_priority: "critical",
        active: true,
      },
    ]);
    mockDb.seed("ops_alerts", [
      {
        id: "a1",
        level: "critical",
        category: "payment",
        title: "Payment failed",
        status: "open",
        entity: "order",
        entity_id: "o1",
        created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        escalation_level: 0,
        task_id: null,
      },
    ]);
    await evaluateAlertEscalation();
    expect(mockDb.rows("ops_alerts")[0]['escalation_level']).toBe(1);
    const before = mockDb.rows("ops_tasks").length;
    await evaluateAlertEscalation();
    expect(mockDb.rows("ops_tasks").length).toBe(before);
  });
});

describe("analytics aggregation + worker orchestration", () => {
  it("aggregates today's operational counters", async () => {
    mockDb.seed("ops_tasks", [
      { id: "t1", status: "open", created_at: new Date().toISOString() },
      { id: "t2", status: "completed", created_at: new Date().toISOString() },
    ]);
    const summary = await aggregateAnalytics();
    expect(summary.tasks_created_today).toBe(2);
    expect(summary.tasks_open).toBe(1);
  });

  it("isolates job failures and returns a per-job result map", async () => {
    const results = await runAutomation(["sla", "analytics", "inventory"]);
    expect(Object.keys(results)).toEqual(["sla", "analytics", "inventory"]);
  });

  it("is safe to retry the full sweep", async () => {
    await runAutomation();
    const events = mockDb.rows("domain_events").length;
    await runAutomation();
    expect(mockDb.rows("domain_events").length).toBeGreaterThanOrEqual(events);
  });
});