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
          // Dedupe by reference (unique index). onConflict ignores duplicates.
          await supabaseAdmin
            .from("revenue_events")
            .upsert(
              {
                reference: ref,
                amount_minor: event.data?.amount ?? 0,
                currency: event.data?.currency ?? "NGN",
                email: event.data?.customer?.email ?? null,
                rsid: typeof meta.rsid === "string" ? meta.rsid : null,
                utm: utm as never,
                product_sku: typeof meta.sku === "string" ? meta.sku : null,
                variant: typeof meta.variant === "string" ? meta.variant : null,
                source: typeof meta.source === "string" ? meta.source : null,
                status: "success",
                lifecycle_stage: "paid",
              },
              { onConflict: "reference", ignoreDuplicates: true },
            );
        } else if (event.event === "charge.failed" && ref) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "failed" })
            .eq("reference", ref);
        } else if (
          (event.event === "refund.processed" ||
            event.event === "charge.dispute.create") &&
          ref
        ) {
          // Refund / chargeback correction loop
          const newStatus =
            event.event === "refund.processed" ? "refunded" : "chargeback";
          await supabaseAdmin
            .from("revenue_events")
            .update({ status: newStatus, lifecycle_stage: "refunded" })
            .eq("reference", ref);
          await supabaseAdmin
            .from("orders")
            .update({ status: newStatus })
            .eq("reference", ref);
        }

        // Make automation bridge — fire-and-forget; do not block webhook ack.
        // URL lives in an env secret (MAKE_WEBHOOK_URL) so it isn't committed
        // to source. An optional MAKE_WEBHOOK_SECRET is forwarded as a shared
        // header the Make.com scenario can verify.
        const makeUrl = process.env.MAKE_WEBHOOK_URL;
        if (makeUrl) {
          try {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };
            const sharedSecret = process.env.MAKE_WEBHOOK_SECRET;
            if (sharedSecret) headers["x-shared-secret"] = sharedSecret;
            await fetch(makeUrl, { method: "POST", headers, body });
          } catch (e) {
            console.error("Make forward failed", e);
          }
        }

        return new Response("ok");
      },
    },
  },
});