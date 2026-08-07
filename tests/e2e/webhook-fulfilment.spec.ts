import { expect, test } from "@playwright/test";
import { paystackSignature, testReference } from "./helpers";

const ENDPOINT = "/api/public/webhooks/paystack";
const hasSecret = Boolean(process.env["PAYSTACK_SECRET_KEY"]);
const allowMutations = process.env["E2E_ALLOW_MUTATIONS"] === "1";

function post(request: import("@playwright/test").APIRequestContext, raw: string, signature?: string) {
  return request.post(ENDPOINT, {
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-paystack-signature": signature } : {}),
    },
    data: Buffer.from(raw, "utf8"),
  });
}

test.describe("webhook-driven fulfilment updates", () => {
  test("rejects an unsigned webhook", async ({ request }) => {
    const raw = JSON.stringify({ event: "charge.success", data: { reference: testReference() } });
    const res = await post(request, raw);
    expect(res.status()).toBe(401);
  });

  test("rejects a webhook signed with the wrong secret", async ({ request }) => {
    const raw = JSON.stringify({ event: "charge.success", data: { reference: testReference() } });
    const res = await post(request, raw, "deadbeef".repeat(16));
    expect(res.status()).toBe(401);
  });

  test.describe(() => {
    test.skip(!hasSecret, "PAYSTACK_SECRET_KEY not configured in this environment");

    test("accepts a correctly signed event and is idempotent on replay", async ({ request }) => {
      const raw = JSON.stringify({
        event: "invoice.create",
        data: { reference: testReference("E2E-IGN"), amount: 100000, currency: "NGN" },
      });
      const sig = paystackSignature(raw);

      const first = await post(request, raw, sig);
      expect(first.status()).toBe(200);
      expect(await first.text()).toBe("ok");

      const replay = await post(request, raw, sig);
      expect(replay.status()).toBe(200);
      expect(await replay.text()).toBe("duplicate");
    });

    test("rejects malformed JSON even when the signature is valid", async ({ request }) => {
      const raw = "{not-json";
      const res = await post(request, raw, paystackSignature(raw));
      expect(res.status()).toBe(400);
    });

    test("processes a paid charge through the fulfilment pipeline", async ({ request }) => {
      test.skip(!allowMutations, "set E2E_ALLOW_MUTATIONS=1 to write payment rows");
      const reference = testReference("E2E-PAID");
      const raw = JSON.stringify({
        event: "charge.success",
        data: {
          reference,
          amount: 250000,
          currency: "NGN",
          customer: { email: "e2e@example.com" },
          metadata: { sku: "RES-ELITE-ACCESS", source: "e2e", funnel_origin: "resofit" },
        },
      });
      const res = await post(request, raw, paystackSignature(raw));
      expect(res.status()).toBe(200);
      expect(await res.text()).toBe("ok");
    });
  });

  test("ops automation worker refuses unauthenticated calls", async ({ request }) => {
    const res = await request.post("/api/public/hooks/ops-automation", { data: {} });
    expect([401, 403]).toContain(res.status());
  });
});