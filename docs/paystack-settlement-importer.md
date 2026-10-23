# Settlement importer operational contract

## Endpoint
- `POST /api/cron/paystack-settlement-reconcile`
- Requires `x-reconciliation-secret` matching server-only `PAYSTACK_RECONCILIATION_CRON_SECRET`.
- Requires server-only `PAYSTACK_SECRET_KEY`.
- Configure a scheduler to call this endpoint periodically; never expose either secret to the browser.

## Evidence semantics
- Reads successful main-account settlements from Paystack `GET /settlement`.
- Reads each settlement's transactions from `GET /settlement/:id/transactions`.
- Matches by the exact Paystack transaction reference and compares the gross transaction amount and currency to the verified charge ledger.
- A `matched` row proves inclusion in a successful settlement with matching gross charge values. It does NOT claim that the transaction's net payout equals its gross amount; Paystack settlement fees and deductions may be aggregated.
- Missing ledger references are counted and skipped. Mismatched amount/currency is marked `variance`.
- The pass is bounded to 50 settlements and 20 pages of 100 transactions per settlement; invoke repeatedly to continue reconciling recent settlements.
- No FX rate is fabricated. Settlement currency is sourced from the Paystack settlement response. Per-transaction net allocation and bank-credit proof require separate evidence.

## Required environment variables
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_RECONCILIATION_CRON_SECRET`

## Production gates
- Apply both additive migrations to canonical production Supabase.
- Configure the secret and scheduler in the backend hosting environment.
- Run a dry-run against test-mode data, then a controlled live run.
- Compare settlement totals, fees, effective amount, and actual bank credit against Paystack dashboard/bank evidence.
- Add alerting for `variance`, skipped ledger references, API failures, and stale settlement runs.
