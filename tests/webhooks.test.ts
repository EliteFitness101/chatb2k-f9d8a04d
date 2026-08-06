import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { mockDb, supabaseAdminMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: supabaseAdminMock,
}));

const { processWebhook, hmacMatches } = await import("@/lib/webhooks/framework.server");

const SECRET = "test-secret";

function makeAdapter() {
  return {
    code: "paystack",
    verify: (raw: string, headers: Headers) =>
      hmacMatches(raw, headers.get("x-paystack-signature"), SECRET, "sha512"),
    normalize: (payload: any) => ({
      eventKey: payload.id as string,
      type: payload.event as "paid" | "failed" | "refunded" | "ignored",
      reference: payload.reference as string,
      amountMinor: payload.amount as number,
      currency: "NGN",
      email: payload.email ?? null,
      metadata: payload.metadata ?? {},
    }),
  };
}

function signedRequest(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  return new Request("https://example.test/api/public/webhooks/paystack", {
    method: "POST",
    body: raw,
    headers: { "x-paystack-signature": createHmac("sha512", secret).update(raw).digest("hex") },
  });
}

beforeEach(() => {
  mockDb.reset();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
});

describe("webhook processing", () => {
  it("rejects an unsigned payload with 401 and raises an alert", async () => {
    const req = new Request("https://example.test/hook", { method: "POST", body: "{}" });
    const res = await processWebhook(makeAdapter(), req);
    expect(res.status).toBe(401);
    expect(mockDb.rows("ops_alerts").some((a) => a['category'] === "webhook")).toBe(true);
    expect(mockDb.rows("domain_events").some((e) => e['event_type'] === "WebhookRejected")).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const res = await processWebhook(
      makeAdapter(),
      signedRequest({ id: "e1", event: "paid", reference: "R1", amount: 1000 }, "wrong"),
    );
    expect(res.status).toBe(401);
  });

  it("processes a verified payment end to end", async () => {
    mockDb.seed("orders", [{ id: "o1", reference: "R1", customer_country: "NG", status: "pending" }]);
    mockDb.seed("hubs", [
      { id: "hub-ng", name: "Lagos HQ", tier: "global_hq", country_code: "NG", sort_order: 1 },
    ]);
    const res = await processWebhook(
      makeAdapter(),
      signedRequest({ id: "e2", event: "paid", reference: "R1", amount: 250_000, email: "a@b.com" }),
    );
    expect(res.status).toBe(200);
    expect(mockDb.rows("orders")[0]['status']).toBe("paid");
    expect(mockDb.rows("payments")[0]['status']).toBe("paid");
    expect(mockDb.rows("revenue_events")).toHaveLength(1);
    const events = mockDb.rows("domain_events").map((e) => e['event_type']);
    expect(events).toContain("PaymentVerified");
    expect(events).toContain("FulfillmentAllocated");
    expect(mockDb.rows("audit_logs").some((a) => a['action'] === "payment.paid")).toBe(true);
  });

  it("prevents duplicate transaction processing", async () => {
    mockDb.seed("orders", [{ id: "o1", reference: "R2", customer_country: "NG", status: "pending" }]);
    mockDb.seed("hubs", [
      { id: "hub-ng", name: "Lagos HQ", tier: "global_hq", country_code: "NG", sort_order: 1 },
    ]);
    const body = { id: "dupe-1", event: "paid", reference: "R2", amount: 1000 };
    await processWebhook(makeAdapter(), signedRequest(body));
    const second = await processWebhook(makeAdapter(), signedRequest(body));
    expect(await second.text()).toBe("duplicate");
    expect(mockDb.rows("payment_events")).toHaveLength(1);
    expect(mockDb.rows("payments")).toHaveLength(1);
  });

  it("opens a recovery workflow when a payment fails", async () => {
    mockDb.seed("orders", [{ id: "o3", reference: "R3", customer_country: "NG", status: "pending" }]);
    await processWebhook(
      makeAdapter(),
      signedRequest({ id: "e3", event: "failed", reference: "R3", amount: 5000, email: "x@y.z" }),
    );
    expect(mockDb.rows("orders")[0]['status']).toBe("failed");
    expect(mockDb.rows("recovery_workflows")[0]['kind']).toBe("failed_payment");
    expect(mockDb.rows("ops_alerts").some((a) => a['category'] === "payment")).toBe(true);
  });

  it("marks revenue as refunded without re-allocating fulfillment", async () => {
    mockDb.seed("orders", [{ id: "o4", reference: "R4", customer_country: "NG", status: "paid" }]);
    mockDb.seed("revenue_events", [{ id: "rev1", reference: "R4", status: "success", lifecycle_stage: "paid" }]);
    await processWebhook(
      makeAdapter(),
      signedRequest({ id: "e4", event: "refunded", reference: "R4", amount: 1000 }),
    );
    expect(mockDb.rows("revenue_events")[0]['status']).toBe("refunded");
    expect(mockDb.rows("fulfillment_orders")).toHaveLength(0);
  });

  it("completes the payment-verification SLA on success", async () => {
    mockDb.seed("orders", [{ id: "o5", reference: "R5", customer_country: "NG", status: "pending" }]);
    mockDb.seed("hubs", [
      { id: "hub-ng", name: "Lagos HQ", tier: "global_hq", country_code: "NG", sort_order: 1 },
    ]);
    const { startSla } = await import("@/lib/ops/sla.server");
    await startSla("payment_verification", "order", "o5");
    await processWebhook(
      makeAdapter(),
      signedRequest({ id: "e5", event: "paid", reference: "R5", amount: 1000 }),
    );
    const timer = mockDb.rows("sla_timers").find((t) => t['sla_type'] === "payment_verification");
    expect(timer?.['completed_at']).toBeTruthy();
  });
});