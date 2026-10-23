import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type PaystackEnvelope<T> = { status: boolean; message?: string; data?: T[]; meta?: { pageCount?: number } };
type Settlement = {
  id: number;
  status: string;
  currency: string;
  total_amount: number;
  effective_amount: number;
  total_fees: number;
  settlement_date?: string;
};
type SettlementTransaction = {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
};

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function paystackGet<T>(path: string, secret: string): Promise<PaystackEnvelope<T>> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json() as PaystackEnvelope<T>;
  if (!response.ok || payload.status !== true) {
    throw new Error(`Paystack API failed for ${path}: HTTP ${response.status}`);
  }
  return payload;
}

export const Route = createFileRoute("/api/cron/paystack-settlement-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.PAYSTACK_RECONCILIATION_CRON_SECRET;
        const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
        if (!cronSecret || !paystackSecret) {
          return Response.json({ ok: false, error: "Reconciliation is not configured" }, { status: 503 });
        }

        const presented = request.headers.get("x-reconciliation-secret") ?? "";
        if (!safeEqual(presented, cronSecret)) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        try {
          const settlements: Settlement[] = [];
          // Bound the invocation while actually advancing settlement pages.
          for (let settlementPage = 1; settlementPage <= 5; settlementPage++) {
            const settlementsEnvelope = await paystackGet<Settlement>(
              `/settlement?perPage=50&page=${settlementPage}&status=success&subaccount=none`,
              paystackSecret,
            );
            const pageRows = settlementsEnvelope.data ?? [];
            settlements.push(...pageRows);
            if (pageRows.length < 50 || settlementPage >= (settlementsEnvelope.meta?.pageCount ?? 1)) break;
          }
          let settlementsChecked = 0;
          let transactionsChecked = 0;
          let ledgerRowsMatched = 0;
          let ledgerRowsVariance = 0;
          let ledgerRowsSkipped = 0;

          // Up to 250 successful settlements per invocation.
          for (const settlement of settlements) {
            if (!Number.isSafeInteger(settlement.id) || settlement.status !== "success") continue;
            settlementsChecked++;
            for (let page = 1; page <= 20; page++) {
              const txEnvelope = await paystackGet<SettlementTransaction>(
                `/settlement/${settlement.id}/transactions?perPage=100&page=${page}`,
                paystackSecret,
              );
              const txs = txEnvelope.data ?? [];
              transactionsChecked += txs.length;
              for (const tx of txs) {
                if (tx.status !== "success" || !tx.reference || !/^[A-Z]{3}$/.test(tx.currency)) continue;
                const { data: existing, error: readError } = await supabaseAdmin
                  .from("payment_currency_ledger")
                  .select("payment_reference,charged_currency,charged_amount_minor")
                  .eq("payment_reference", tx.reference)
                  .maybeSingle();
                if (readError) throw readError;
                if (!existing) {
                  ledgerRowsSkipped++;
                  continue;
                }

                // This proves the transaction is included in a successful
                // settlement. It does NOT allocate aggregate settlement fees
                // to an individual transaction or claim its net bank payout.
                const exactChargeMatch =
                  existing.charged_currency === tx.currency &&
                  Number(existing.charged_amount_minor) === tx.amount;
                const { error: updateError } = await supabaseAdmin
                  .from("payment_currency_ledger")
                  .update({
                    settlement_currency: settlement.currency,
                    settlement_reference: String(settlement.id),
                    settlement_transaction_amount_minor: tx.amount,
                    settlement_status: settlement.status,
                    reconciliation_status: exactChargeMatch ? "matched" : "variance",
                    reconciled_at: new Date().toISOString(),
                    provider_event: {
                      settlement_id: settlement.id,
                      settlement_date: settlement.settlement_date ?? null,
                      settlement_total_amount_minor: settlement.total_amount,
                      settlement_effective_amount_minor: settlement.effective_amount,
                      settlement_total_fees_minor: settlement.total_fees,
                      transaction_id: tx.id,
                      transaction_currency: tx.currency,
                      transaction_amount_minor: tx.amount,
                      exact_charge_match: exactChargeMatch,
                      net_per_transaction_fee_allocation: "not_available_from_settlement_summary",
                    },
                    updated_at: new Date().toISOString(),
                  })
                  .eq("payment_reference", tx.reference);
                if (updateError) throw updateError;
                if (exactChargeMatch) ledgerRowsMatched++;
                else ledgerRowsVariance++;
              }
              if (txs.length < 100 || page >= (txEnvelope.meta?.pageCount ?? 1)) break;
            }
          }

          return Response.json({
            ok: true,
            mode: "bounded_read_and_reconcile",
            settlementsChecked,
            transactionsChecked,
            ledgerRowsMatched,
            ledgerRowsVariance,
            ledgerRowsSkipped,
            note: "Matched means included in a successful Paystack settlement and gross transaction amount/currency matched. Net payout allocation is not inferred. Up to 250 settlements are scanned per invocation.",
          }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          console.error("[paystack-settlement-reconcile] failed", error);
          return Response.json({ ok: false, error: "Settlement reconciliation failed; inspect server logs" }, { status: 502 });
        }
      },
    },
  },
});
