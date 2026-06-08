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
          data?: {
            reference?: string;
            status?: string;
            amount?: number;
            currency?: string;
            customer?: { email?: string };
            metadata?: Record<string, unknown> | null;
          };
        };

        const ref = event.data?.reference;
        if (event.event === "charge.success" && ref) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "paid" })
            .eq("reference", ref);

          // Revenue OS — record attributable event
          const meta = (event.data?.metadata ?? {}) as Record<string, unknown>;
          const utm = meta.utm && typeof meta.utm === "object" ? meta.utm : {};
          await supabaseAdmin.from("revenue_events").insert({
            reference: ref,
            amount_minor: event.data?.amount ?? 0,
            currency: event.data?.currency ?? "NGN",
            email: event.data?.customer?.email ?? null,
            rsid: typeof meta.rsid === "string" ? meta.rsid : null,
            utm: utm as never,
            product_sku: typeof meta.sku === "string" ? meta.sku : null,
            variant: typeof meta.variant === "string" ? meta.variant : null,
            source: typeof meta.source === "string" ? meta.source : null,
          });
        } else if (event.event === "charge.failed" && ref) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "failed" })
            .eq("reference", ref);
        }

        // Make automation bridge — fire-and-forget; do not block webhook ack.
        try {
          await fetch(
            "https://hook.eu1.make.com/p0c26asklninfrxhp2sw6nkdjjb19a89",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            },
          );
        } catch (e) {
          console.error("Make forward failed", e);
        }

        return new Response("ok");
      },
    },
  },
});