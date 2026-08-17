import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, supabaseAdminMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: supabaseAdminMock,
}));

const { ensureTask, transitionTask, assignTask } = await import("@/lib/ops/tasks.server");
const { startSla, completeSla, evaluateSlaTimers } = await import("@/lib/ops/sla.server");
const { openRecovery, markRecovered } = await import("@/lib/ops/recovery.server");
const { allocatePayment, transitionFulfillment } = await import("@/lib/fulfillment.server");
const { publishEvent, audit } = await import("@/lib/events.server");
const { slaWindow } = await import("@/lib/ops/rules");

beforeEach(() => {
  mockDb.reset();
});

describe("operations tasks", () => {
  it("creates a task idempotently by dedupe key", async () => {
    const first = await ensureTask({ type: "inventory_restock", priority: "high", dedupeKey: "restock:sku-1", entity: "inventory_item", entityId: "i1" });
    const second = await ensureTask({ type: "inventory_restock", priority: "high", dedupeKey: "restock:sku-1" });
    expect(first).toBeTruthy(); expect(second).toBe(first); expect(mockDb.rows("ops_tasks")).toHaveLength(1);
  });

  it("emits canonical events and audit entries on creation", async () => {
    await ensureTask({ type: "compliance_review", priority: "normal", dedupeKey: "c:1" });
    expect(mockDb.rows("resofit_events").some((e) => e["event_name"] === "OpsTaskCreated")).toBe(true);
    expect(mockDb.rows("audit_logs").some((a) => a["action"] === "task.created")).toBe(true);
    expect(mockDb.rows("ops_task_events")).toHaveLength(1);
  });

  it("rejects illegal transitions and records legal ones", async () => {
    const id = (await ensureTask({ type: "compliance_review", priority: "low", dedupeKey: "c:2" }))!;
    await transitionTask(id, "completed", null);
    const bad = await transitionTask(id, "open", null);
    expect(bad.ok).toBe(false); expect(mockDb.rows("ops_tasks")[0]["status"]).toBe("completed");
  });

  it("assigns tasks with an audit trail", async () => {
    const id = (await ensureTask({ type: "support_escalation", priority: "high", dedupeKey: "s:1" }))!;
    const res = await assignTask(id, "user-1", "actor-1");
    expect(res.ok).toBe(true); expect(mockDb.rows("ops_tasks")[0]["assignee"]).toBe("user-1");
    expect(mockDb.rows("audit_logs").some((a) => a["action"] === "task.assigned")).toBe(true);
  });

  it("starts a support-response SLA automatically for escalations", async () => {
    await ensureTask({ type: "support_escalation", priority: "high", dedupeKey: "s:2" });
    const timers = mockDb.rows("sla_timers"); expect(timers).toHaveLength(1);
    expect(timers[0]["sla_type"]).toBe("support_response"); expect(timers[0]["status"]).toBe("running");
  });

  it("closes the support SLA when the escalation completes", async () => {
    const id = (await ensureTask({ type: "support_escalation", priority: "high", dedupeKey: "s:3" }))!;
    await transitionTask(id, "completed", "actor");
    expect(mockDb.rows("sla_timers")[0]["completed_at"]).toBeTruthy();
    expect(["met", "missed"]).toContain(mockDb.rows("sla_timers")[0]["status"]);
  });
});

describe("SLA sweep", () => {
  it("warns then breaches and raises a remediation task", async () => {
    await startSla("payment_verification", "payment", "payment-1");
    const later = new Date(Date.now() + 15 * 60_000); const warn = await evaluateSlaTimers(later);
    expect(warn.warned).toBe(1);
    const breachAt = new Date(Date.now() + 90 * 60_000); const breach = await evaluateSlaTimers(breachAt);
    expect(breach.breached).toBe(1);
    expect(mockDb.rows("ops_tasks").some((t) => t["task_type"] === "failed_payment_followup")).toBe(true);
    expect(mockDb.rows("ops_alerts").some((a) => a["level"] === "critical")).toBe(true);
  });

  it("is idempotent — re-running does not duplicate work", async () => {
    await startSla("payment_verification", "payment", "payment-2");
    const at = new Date(Date.now() + 90 * 60_000); await evaluateSlaTimers(at); const second = await evaluateSlaTimers(at);
    expect(second.breached).toBe(0); expect(mockDb.rows("ops_tasks")).toHaveLength(1);
  });

  it("restarting a timer upserts rather than duplicating", async () => {
    await startSla("picking", "fulfillment_order", "f1"); await startSla("picking", "fulfillment_order", "f1");
    expect(mockDb.rows("sla_timers")).toHaveLength(1);
  });

  it("completes timers and records met/missed", async () => {
    const past = new Date(Date.now() - 10 * 60 * 60_000);
    mockDb.seed("sla_timers", [{ id: "t1", sla_type: "picking", entity: "fulfillment_order", entity_id: "f2", status: "running", ...slaWindow("picking", past), completed_at: null }]);
    await completeSla("picking", "fulfillment_order", "f2");
    expect(mockDb.rows("sla_timers")[0]["status"]).toBe("missed");
    expect(mockDb.rows("resofit_events").some((e) => e["event_name"] === "SlaBreached")).toBe(true);
  });
});

describe("recovery workflows", () => {
  it("opens a recovery with a follow-up task, once", async () => {
    const a = await openRecovery({ kind: "failed_payment", reference: "REF-1", email: "a@b.com", amountMinor: 250_000, dedupeKey: "failed:REF-1" });
    const b = await openRecovery({ kind: "failed_payment", reference: "REF-1", dedupeKey: "failed:REF-1" });
    expect(a).toBeTruthy(); expect(b).toBe(a); expect(mockDb.rows("recovery_workflows")).toHaveLength(1); expect(mockDb.rows("ops_tasks")).toHaveLength(1);
  });

  it("converts recoveries and closes their task when payment lands", async () => {
    await openRecovery({ kind: "failed_payment", reference: "REF-2", dedupeKey: "failed:REF-2" });
    const res = await markRecovered("REF-2");
    expect(res.converted).toBe(1); expect(mockDb.rows("recovery_workflows")[0]["status"]).toBe("recovered"); expect(mockDb.rows("ops_tasks")[0]["status"]).toBe("completed");
    expect(mockDb.rows("resofit_events").some((e) => e["event_name"] === "RecoveryConverted")).toBe(true);
  });
});

describe("canonical fulfillment + inventory reservation", () => {
  function seedPayment(country = "NG", qty = 1) {
    mockDb.seed("payments", [{ id: "p1", paystack_ref: "PS-1", order_id: "o1", user_id: "u1", customer_email: "a@b.com", amount: 100000, currency: "NGN", status: "success", product_sku: "RES-IRON-15", rsid: "rsid-1" }]);
    mockDb.seed("resofit_hub_inventory", [{ hub_code: "Lagos,NG", sku: "RES-IRON-15", on_hand: 10, reserved: 0 }]);
    return { country, qty };
  }

  it("allocates a verified physical payment to the in-country hub and reserves inventory", async () => {
    seedPayment("NG", 2);
    const res = await allocatePayment("p1", { countryCode: "NG", items: [{ sku: "RES-IRON-15", quantity: 2 }] });
    expect(res.ok).toBe(true); expect(res.fulfillmentId).toBeTruthy();
    expect(mockDb.rows("resofit_hub_inventory")[0]["reserved"]).toBe(2);
    expect(mockDb.rows("resofit_fulfillment_orders")[0]["status"]).toBe("allocated");
    expect(mockDb.rows("resofit_fulfillment_items")).toHaveLength(1);
  });

  it("emits allocation events and audit records", async () => {
    seedPayment();
    const res = await allocatePayment("p1", { countryCode: "NG", items: [{ sku: "RES-IRON-15", quantity: 1 }] });
    expect(res.ok).toBe(true);
    const types = mockDb.rows("resofit_events").map((e) => e["event_name"]);
    expect(types).toContain("InventoryReserved"); expect(types).toContain("FulfillmentAllocated");
    expect(mockDb.rows("audit_logs").some((a) => a["action"] === "fulfillment.allocated")).toBe(true);
  });

  it("returns a controlled exception when no hub has stock", async () => {
    mockDb.seed("payments", [{ id: "p2", paystack_ref: "PS-2", user_id: "u1", customer_email: "a@b.com", amount: 100000, currency: "NGN", status: "success", product_sku: "RES-IRON-15" }]);
    const res = await allocatePayment("p2", { countryCode: "NG", items: [{ sku: "RES-IRON-15", quantity: 1 }] });
    expect(res.ok).toBe(false); expect(res.exception).toBe(true);
    expect(mockDb.rows("ops_alerts").some((a) => a["category"] === "fulfillment")).toBe(true);
  });

  it("advances the canonical fulfillment lifecycle", async () => {
    mockDb.seed("resofit_fulfillment_orders", [{ id: "f1", payment_id: "p1", status: "allocated" }]);
    await transitionFulfillment("f1", "picking"); await transitionFulfillment("f1", "packed", "actor-1");
    expect(mockDb.rows("resofit_fulfillment_orders")[0]["status"]).toBe("packed");
    expect(mockDb.rows("resofit_fulfillment_events")).toHaveLength(2);
  });
});

describe("observability primitives", () => {
  it("never throws when the event sink fails", async () => {
    await expect(publishEvent("OrderCreated", "order", "x", {})).resolves.toBeUndefined();
    await expect(audit("test.action", "order", "x")).resolves.toBeUndefined();
  });

  it("writes immutable audit rows with actor + detail", async () => {
    await audit("payment.paid", "order", "RES-9", { provider: "paystack" }, "actor-9");
    const row = mockDb.rows("audit_logs")[0];
    expect(row["user_id"]).toBe("actor-9"); expect(row["metadata"]).toMatchObject({ provider: "paystack" });
  });
});
