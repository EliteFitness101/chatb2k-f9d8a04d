import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { mockDb, supabaseAdminMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: supabaseAdminMock }));
const { processWebhook, hmacMatches } = await import("@/lib/webhooks/framework.server");
const SECRET = "test-secret";

function makeAdapter(currency = "NGN") {
  return {
    code: "paystack",
    verify: (raw: string, headers: Headers) => hmacMatches(raw, headers.get("x-paystack-signature"), SECRET, "sha512"),
    normalize: (payload: any) => ({
      eventKey: payload.id as string,
      type: payload.event as "paid" | "failed" | "refunded" | "ignored",
      reference: payload.reference as string,
      amountMinor: payload.amount as number,
      currency,
      email: payload.email ?? null,
      metadata: payload.metadata ?? {},
    }),
  };
}

function signedRequest(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  return new Request("https://example.test/api/public/webhooks/paystack", {
    method: "POST", body: raw,
    headers: { "x-paystack-signature": createHmac("sha512", secret).update(raw).digest("hex") },
  });
}

beforeEach(() => { mockDb.reset(); vi.stubGlobal("fetch", vi.fn(async () => new Response("ok"))); });

describe("webhook processing", () => {
  it("rejects an unsigned payload with 401 and raises an alert", async () => {
    const res = await processWebhook(makeAdapter(), new Request("https://example.test/hook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(mockDb.rows("ops_alerts").some((a) => a.category === "webhook")).toBe(true);
    expect(mockDb.rows("resofit_events").some((e) => e.event_name === "WebhookRejected")).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const res = await processWebhook(makeAdapter(), signedRequest({ id: "e1", event: "paid", reference: "R1", amount: 250000 }, "wrong"));
    expect(res.status).toBe(401);
  });

  it("processes a verified digital payment and completes value delivery", async () => {
    mockDb.seed("payments", [{ id: "p1", paystack_ref: "R1", amount: 2500, currency: "NGN", customer_email: "a@b.com", product_sku: "APEX", plan_type: "commerce", funnel_origin: "chatb2k", status: "pending" }]);
    const res = await processWebhook(makeAdapter(), signedRequest({ id: "e2", event: "paid", reference: "R1", amount: 250000, email: "a@b.com" }));
    expect(res.status).toBe(200);
    expect(mockDb.rows("payments")[0].status).toBe("success");
    expect(mockDb.rows("revenue_events")).toHaveLength(1);
    expect(mockDb.rows("resofit_events").map((e) => e.event_name)).toContain("PaymentVerified");
    expect(mockDb.rows("resofit_events").some((e) => e.event_name === "FulfillmentAllocated" && e.payload?.mode === "digital")).toBe(true);
    expect(mockDb.rows("resofit_fulfillment_orders")).toHaveLength(0);
    expect(mockDb.rows("audit_logs").some((a) => a.action === "payment.verified")).toBe(true);
  });

  it("processes a verified physical payment and reserves inventory atomically", async () => {
    mockDb.seed("payments", [{ id: "p-physical", paystack_ref: "R-PHYS", amount: 22000, currency: "NGN", customer_email: "buyer@example.com", product_sku: "RES-IRON-15", plan_type: "commerce", funnel_origin: "chatb2k", status: "pending" }]);
    mockDb.seed("resofit_hub_inventory", [{ hub_code: "Lagos,NG", sku: "RES-IRON-15", on_hand: 10, reserved: 0 }]);
    const res = await processWebhook(makeAdapter(), signedRequest({ id: "e-physical", event: "paid", reference: "R-PHYS", amount: 2200000, email: "buyer@example.com", metadata: { country: "NG", sku: "RES-IRON-15" } }));
    expect(res.status).toBe(200);
    expect(mockDb.rows("resofit_hub_inventory")[0].reserved).toBe(1);
    expect(mockDb.rows("resofit_fulfillment_orders")[0].status).toBe("allocated");
    expect(mockDb.rows("resofit_fulfillment_items")[0].sku).toBe("RES-IRON-15");
    expect(mockDb.rows("resofit_events").map((e) => e.event_name)).toContain("InventoryReserved");
    expect(mockDb.rows("resofit_events").map((e) => e.event_name)).toContain("FulfillmentAllocated");
  });

  it("rejects a paid webhook when the amount does not match the canonical payment", async () => {
    mockDb.seed("payments", [{ id: "p-amount", paystack_ref: "R-AMOUNT", amount: 2500, currency: "NGN", product_sku: "APEX", status: "pending" }]);
    const res = await processWebhook(makeAdapter(), signedRequest({ id: "e-amount", event: "paid", reference: "R-AMOUNT", amount: 249900 }));
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("mismatch");
    expect(mockDb.rows("payments")[0].status).toBe("pending");
    expect(mockDb.rows("payment_event_processing")[0].status).toBe("failed");
    expect(mockDb.rows("resofit_fulfillment_orders")).toHaveLength(0);
  });

  it("rejects a paid webhook when the currency does not match the canonical payment", async () => {
    mockDb.seed("payments", [{ id: "p-currency", paystack_ref: "R-CURRENCY", amount: 2500, currency: "NGN", product_sku: "APEX", status: "pending" }]);
    const res = await processWebhook(makeAdapter("USD"), signedRequest({ id: "e-currency", event: "paid", reference: "R-CURRENCY", amount: 250000 }));
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("mismatch");
    expect(mockDb.rows("payments")[0].status).toBe("pending");
    expect(mockDb.rows("resofit_fulfillment_orders")).toHaveLength(0);
  });

  it("prevents duplicate transaction processing", async () => {
    mockDb.seed("payments", [{ id: "p-dupe", paystack_ref: "R2", amount: 10, currency: "NGN", product_sku: "APEX", status: "pending" }]);
    const body = { id: "dupe-1", event: "paid", reference: "R2", amount: 1000 };
    const first = await processWebhook(makeAdapter(), signedRequest(body));
    const second = await processWebhook(makeAdapter(), signedRequest(body));
    expect(first.status).toBe(200);
    expect(await second.text()).toBe("duplicate");
    expect(mockDb.rows("payment_event_processing")).toHaveLength(1);
    expect(mockDb.rows("payments")).toHaveLength(1);
  });

  it("handles a failed payment in the canonical payment ledger", async () => {
    mockDb.seed("payments", [{ id: "p3", paystack_ref: "R3", status: "pending" }]);
    await processWebhook(makeAdapter(), signedRequest({ id: "e3", event: "failed", reference: "R3", amount: 5000, email: "x@y.z" }));
    expect(mockDb.rows("payments")[0].status).toBe("failed");
    expect(mockDb.rows("resofit_events").map((e) => e.event_name)).toContain("PaymentFailed");
  });

  it("marks revenue as refunded without re-allocating fulfillment", async () => {
    mockDb.seed("payments", [{ id: "p4", paystack_ref: "R4", status: "success" }]);
    mockDb.seed("revenue_events", [{ id: "rev1", payment_reference: "R4", status: "success", lifecycle_stage: "paid" }]);
    await processWebhook(makeAdapter(), signedRequest({ id: "e4", event: "refunded", reference: "R4", amount: 1000 }));
    expect(mockDb.rows("payments")[0].status).toBe("refunded");
    expect(mockDb.rows("revenue_events")[0].status).toBe("refunded");
  });
});
