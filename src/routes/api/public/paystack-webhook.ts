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
            id?: number;
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

          // Keep customer display price, actual Paystack charge, and payout
          // settlement separate. Never calculate settlement from display FX.
          const chargedCurrency = typeof event.data?.currency === "string" &&
            /^[A-Z]{3}$/.test(event.data.currency) ? event.data.currency : "NGN";
          const chargedAmount = Number.isSafeInteger(event.data?.amount) && (event.data?.amount ?? -1) >= 0
            ? event.data!.amount!
            : 0;
          const displayCurrency = typeof meta.display_currency === "string" &&
            /^[A-Z]{3}$/.test(meta.display_currency) ? meta.display_currency : chargedCurrency;
          const metadataDisplayAmount = meta.display_amount_minor;
          const displayAmount = typeof metadataDisplayAmount === "number" &&
            Number.isSafeInteger(metadataDisplayAmount) && metadataDisplayAmount >= 0
            ? metadataDisplayAmount : chargedAmount;

          const { error: ledgerError } = await supabaseAdmin.from("payment_currency_ledger").upsert(
            {
              payment_reference: ref,
              paystack_transaction_id: event.data?.id ?? null,
              customer_email: event.data?.customer?.email ?? null,
              display_currency: displayCurrency,
              display_amount_minor: displayAmount,
              charged_currency: chargedCurrency,
              charged_amount_minor: chargedAmount,
              payment_status: "success",
              reconciliation_status: "awaiting_settlement",
              provider_event: {
                event: event.event,
                status: event.data?.status ?? "success",
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "payment_reference", ignoreDuplicates: true },
          );
          // Do not acknowledge a signed success event if the audit ledger write
          // failed; Paystack can retry the webhook and preserve reconciliation.
          if (ledgerError) {
            console.error("[paystack-webhook] currency ledger write failed", ledgerError);
            return new Response("Ledger write failed", { status: 500 });
          }
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
          await supabaseAdmin
            .from("payment_currency_ledger")
            .update({ payment_status: newStatus, updated_at: new Date().toISOString() })
            .eq("payment_reference", ref);
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