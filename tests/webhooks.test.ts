import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { mockDb, supabaseAdminMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: supabaseAdminMock }));
const { processWebhook, hmacMatches } = await import("@/lib/webhooks/framework.server");
const { paystackAdapter } = await import("@/lib/webhooks/adapters.server");
const SECRET = "test-secret";

function makeAdapter(currency = "NGN") {
  return {
    code: "paystack",
    verify: (raw: string, headers: Headers) => hmacMatches(raw, headers.get("x-paystack-signature"), SECRET, "sha512"),
    normalize: (payload: any) => ({
      eventKey: payload.id as string,
      type: payload.event as "paid" | "failed" | "refunded" | "reversed" | "disputed" | "ignored",
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

describe("Paystack event classification", () => {
  it("does not confuse refund pending/failed with completed refunds", () => {
    expect(paystackAdapter.normalize({ event: "refund.pending", data: { reference: "R-PENDING", amount: 50000 } }).type).toBe("ignored");
    expect(paystackAdapter.normalize({ event: "refund.failed", data: { reference: "R-FAILED", amount: 50000 } }).type).toBe("ignored");
    expect(paystackAdapter.normalize({ event: "refund.processed", data: { reference: "R-REFUNDED", amount: 50000 } }).type).toBe("refunded");
  });

  it("keeps disputes and reversals distinct from refunds and failures", () => {
    expect(paystackAdapter.normalize({ event: "charge.dispute.create", data: { reference: "R-DISPUTE", amount: 250000 } }).type).toBe("disputed");
    expect(paystackAdapter.normalize({ event: "charge.reversed", data: { reference: "R-REVERSED", amount: 250000 } }).type).toBe("reversed");
    expect(paystackAdapter.normalize({ event: "charge.failed", data: { reference: "R-FAILED", amount: 250000 } }).type).toBe("failed");
    expect(paystackAdapter.normalize({ event: "charge.cancelled", data: { reference: "R-CANCELLED", amount: 250000 } }).type).toBe("ignored");
  });
});

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
    expect(mockDb.rows("payment_events")).toHaveLength(1);
    expect(mockDb.rows("payment_events")[0].processed).toBe(false);
    expect(mockDb.rows("payment_event_processing")[0].status).toBe("processed");
    expect(mockDb.rows("revenue_events")).toHaveLength(1);
    expect(mockDb.rows("revenue_events")[0].payment_reference).toBe("R1");
    expect(mockDb.rows("resofit_events").map((e) => e.event_name)).toContain("payment.succeeded");
    expect(mockDb.rows("chatb2k_learning_events").some((e) => e.event_type === "payment.succeeded" && e.platform === "resofit")).toBe(true);
    expect(mockDb.rows("resofit_events").map((e) => e.event_name)).toContain("PaymentVerified");
    expect(mockDb.rows("resofit_events").some((e) => e.event_name === "FulfillmentAllocated" && e.payload?.mode === "digital")).toBe(true);
    expect(mockDb.rows("resofit_fulfillment_orders")).toHaveLength(0);
    expect(mockDb.rows("audit_logs").some((a) => a.action === "payment.verified")).toBe(true);
  });

  it("processes a verified physical payment and reserves inventory atomically", async () => {
    mockDb.seed("payments", [{ id: "p-physical", paystack_ref: "R-PHYS", amount: 22000, currency: "NGN", customer_email: "buyer@example.com", product_sku: "res-iron-15", plan_type: "commerce", funnel_origin: "chatb2k", status: "pending" }]);
    mockDb.seed("resofit_hub_inventory", [{ hub_code: "NG-LAGOS", sku: "res-iron-15", on_hand: 10, reserved: 0 }]);
    const res = await processWebhook(makeAdapter(), signedRequest({ id: "e-physical", event: "paid", reference: "R-PHYS", amount: 2200000, email: "buyer@example.com", metadata: { country: "NG", sku: "res-iron-15" } }));
    expect(res.status).toBe(200);
    expect(mockDb.rows("resofit_hub_inventory")[0].reserved).toBe(1);
    expect(mockDb.rows("resofit_fulfillment_orders")[0].status).toBe("allocated");
    expect(mockDb.rows("resofit_fulfillment_items")[0].sku).toBe("res-iron-15");
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


  it("retries a failed event with the same provider event identity", async () => {
    mockDb.seed("payments", [{ id: "p-retry", paystack_ref: "R-RETRY", amount: 2500, currency: "NGN", customer_email: "retry@example.com", product_sku: "APEX", plan_type: "commerce", status: "pending" }]);
    const failedAttempt = await processWebhook(makeAdapter(), signedRequest({ id: "retry-event-1", event: "paid", reference: "R-RETRY", amount: 249900 }));
    expect(failedAttempt.status).toBe(422);
    expect(mockDb.rows("payment_event_processing")[0].status).toBe("failed");

    const retried = await processWebhook(makeAdapter(), signedRequest({ id: "retry-event-1", event: "paid", reference: "R-RETRY", amount: 250000 }));
    expect(retried.status).toBe(200);
    expect(mockDb.rows("payment_event_processing")).toHaveLength(1);
    expect(mockDb.rows("payment_event_processing")[0].status).toBe("processed");
    expect(mockDb.rows("payment_event_processing")[0].attempt_count).toBe(2);
    expect(mockDb.rows("payments")[0].status).toBe("success");
  });





  it("applies partial refunds to net revenue without revoking a still-paid purchase", async () => {
    mockDb.seed("payments", [{ id: "p-partial-refund", paystack_ref: "R-PARTIAL", amount: 2500, currency: "NGN", customer_email: "buyer@example.com", product_sku: "RESET-001", plan_type: "commerce", status: "success", reconciled: true }]);
    mockDb.seed("revenue_events", [{ id: "rev-partial-refund", payment_reference: "R-PARTIAL", payment_id: "p-partial-refund", amount: 2500, currency: "NGN", status: "success" }]);

    const response = await processWebhook(makeAdapter(), signedRequest({ id: "refund-partial", event: "refunded", reference: "R-PARTIAL", amount: 50000, email: "buyer@example.com", metadata: { sku: "RESET-001" } }));

    expect(response.status).toBe(200);
    expect(mockDb.rows("payments")[0].status).toBe("success");
    expect(mockDb.rows("payments")[0].gateway_response).toBe("webhook_partially_refunded");
    expect(mockDb.rows("revenue_events")[0].amount).toBe(2000);
    expect(mockDb.rows("revenue_events")[0].status).toBe("success");
    expect(mockDb.rows("chatb2k_learning_events").some((e) => e.event_type === "payment.partially_refunded")).toBe(true);
  });

  it("does not mark a dispute as refunded or revoke the paid state", async () => {
    mockDb.seed("payments", [{ id: "p-dispute", paystack_ref: "R-DISPUTE", amount: 2500, currency: "NGN", customer_email: "buyer@example.com", product_sku: "RESET-001", plan_type: "commerce", status: "success", reconciled: true }]);
    mockDb.seed("revenue_events", [{ id: "rev-dispute", payment_reference: "R-DISPUTE", payment_id: "p-dispute", amount: 2500, currency: "NGN", status: "success" }]);

    const response = await processWebhook(makeAdapter(), signedRequest({ id: "dispute-open", event: "disputed", reference: "R-DISPUTE", amount: 250000, email: "buyer@example.com", metadata: { sku: "RESET-001" } }));

    expect(response.status).toBe(200);
    expect(mockDb.rows("payments")[0].status).toBe("success");
    expect(mockDb.rows("revenue_events")[0].status).toBe("success");
    expect(mockDb.rows("chatb2k_learning_events").some((e) => e.event_type === "payment.disputed")).toBe(true);
  });

  it("records a completed refund as refunded and removes it from collected revenue", async () => {
    mockDb.seed("payments", [{ id: "p-full-refund", paystack_ref: "R-FULL", amount: 2500, currency: "NGN", customer_email: "buyer@example.com", product_sku: "RESET-001", plan_type: "commerce", status: "success", reconciled: true }]);
    mockDb.seed("revenue_events", [{ id: "rev-full-refund", payment_reference: "R-FULL", payment_id: "p-full-refund", amount: 2500, currency: "NGN", status: "success" }]);

    const response = await processWebhook(makeAdapter(), signedRequest({ id: "refund-full", event: "refunded", reference: "R-FULL", amount: 250000, email: "buyer@example.com", metadata: { sku: "RESET-001" } }));

    expect(response.status).toBe(200);
    expect(mockDb.rows("payments")[0].status).toBe("refunded");
    expect(mockDb.rows("revenue_events")[0].status).toBe("refunded");
  });

  it("upserts the revenue ledger and canonical purchase event on recovery", async () => {
    mockDb.seed("payments", [{ id: "p-ledger-retry", paystack_ref: "R-LEDGER-RETRY", amount: 2500, currency: "NGN", customer_email: "ledger@example.com", product_sku: "RESET-001", plan_type: "commerce", status: "pending" }]);
    mockDb.seed("revenue_events", [{ id: "rev-ledger-retry", payment_reference: "R-LEDGER-RETRY", amount: 1000, currency: "NGN", status: "success" }]);

    const response = await processWebhook(makeAdapter(), signedRequest({ id: "ledger-retry-event", event: "paid", reference: "R-LEDGER-RETRY", amount: 250000, email: "ledger@example.com", metadata: { sku: "RESET-001" } }));

    expect(response.status).toBe(200);
    expect(mockDb.rows("revenue_events")).toHaveLength(1);
    expect(mockDb.rows("revenue_events")[0].amount).toBe(2500);
    expect(mockDb.rows("resofit_events").filter((e) => e.event_name === "payment.succeeded")).toHaveLength(1);
    expect(mockDb.rows("chatb2k_learning_events").filter((e) => e.event_type === "payment.succeeded")).toHaveLength(1);
  });

  it("processes a refund event after a successful payment using a separate event identity", async () => {
    mockDb.seed("payments", [{ id: "p-refund-after-paid", paystack_ref: "R-LIFECYCLE", amount: 1000, currency: "NGN", customer_email: "buyer@example.com", product_sku: "APEX", plan_type: "commerce", status: "pending" }]);
    const paid = await processWebhook(makeAdapter(), signedRequest({ id: "lifecycle-paid", event: "paid", reference: "R-LIFECYCLE", amount: 100000 }));
    expect(paid.status).toBe(200);
    const refunded = await processWebhook(makeAdapter(), signedRequest({ id: "lifecycle-refund", event: "refunded", reference: "R-LIFECYCLE", amount: 100000 }));
    expect(refunded.status).toBe(200);
    expect(mockDb.rows("payment_event_processing")).toHaveLength(2);
    expect(mockDb.rows("payment_event_processing").every((row) => row.status === "processed")).toBe(true);
    expect(mockDb.rows("payments")[0].status).toBe("refunded");
    expect(mockDb.rows("revenue_events")[0].status).toBe("refunded");
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
