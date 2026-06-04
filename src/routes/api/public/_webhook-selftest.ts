import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// TEMPORARY self-test for /api/public/paystack-webhook signature + fulfillment.
// Safe to delete once verified. Does NOT call Paystack.
export const Route = createFileRoute("/api/public/_webhook-selftest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return new Response("no secret", { status: 503 });

        const reference = `SELFTEST-${Date.now()}`;

        const { error: insErr } = await supabaseAdmin.from("orders").insert({
          reference,
          rail: "paystack",
          currency: "NGN",
          amount_minor: 100000,
          status: "pending",
          customer_email: "selftest@example.com",
          customer_name: "Self Test",
          customer_country: "NG",
        });
        if (insErr) return Response.json({ step: "insert", error: insErr.message }, { status: 500 });

        const body = JSON.stringify({
          event: "charge.success",
          data: { reference, status: "success", amount: 100000 },
        });
        const signature = createHmac("sha512", secret).update(body).digest("hex");

        const url = new URL("/api/public/paystack-webhook", request.url);
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-paystack-signature": signature },
          body,
        });
        const hookText = await res.text();

        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("reference,status,assigned_hub_id")
          .eq("reference", reference)
          .single();

        return Response.json({
          webhook_status: res.status,
          webhook_body: hookText,
          order,
          verdict: order?.status === "paid" ? "PASS" : "FAIL",
        });
      },
    },
  },
});