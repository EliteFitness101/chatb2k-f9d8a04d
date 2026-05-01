import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return new Response("Not configured", { status: 503 });

        const signature = request.headers.get("x-paystack-signature");
        const body = await request.text();

        const expected = createHmac("sha512", secret).update(body).digest("hex");
        if (
          !signature ||
          signature.length !== expected.length ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        ) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body) as {
          event: string;
          data?: { reference?: string; status?: string };
        };

        if (event.event === "charge.success" && event.data?.reference) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "paid" })
            .eq("reference", event.data.reference);
        } else if (event.event === "charge.failed" && event.data?.reference) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "failed" })
            .eq("reference", event.data.reference);
        }

        return new Response("ok");
      },
    },
  },
});