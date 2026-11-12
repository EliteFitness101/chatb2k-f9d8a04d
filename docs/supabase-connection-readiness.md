# ChatB2K Supabase connection readiness

**Canonical mapping (13 October 2026)**

- ChatB2K orchestration repository: `EliteFitness101/chatb2k-f9d8a04d`
- Intended Supabase target under review: `ResoFlex-Edge-Node` — `xtgteviwtoupbfvorrmk` (eu-central-1)
- Commerce, payment, catalog, entitlements, and paid digital-delivery source of truth: `shopb2k` → `resonance-fitness` — `vbqjvmnhdtdhmeeudqnn` (eu-west-1)
- Legacy retirement candidate: `EliteFitness101/chatb2k`; do not archive the active repository.

## Safety gate before enabling production deployment

The active ChatB2K repository currently has 38 migration files and six function directories. The target Edge Node has zero recorded migrations and two deployed functions (`xbang-runtime-health`, `xbang-live-pipeline`). This is migration/function drift, not a production-ready GitHub deployment mapping.

The primary `resonance-fitness` project currently reports 266 migration records and 57 deployed Edge Functions. Those are live primary-project inventories, not a migration set to replay into the Edge Node. The ChatB2K repository's migration files must not be blindly applied to either project; first reconcile each migration's provenance, dependencies and intended project.

Until migration dependencies and function configuration have been reconciled:

1. Connect the repository through Supabase Dashboard → Project Settings → Integrations → GitHub Integration.
2. Select `EliteFitness101/chatb2k-f9d8a04d` and set Working directory to `.` because `supabase/` is at the repository root.
3. Keep **Deploy to production** disabled.
4. Keep automatic branching disabled until branch/migration behavior is reviewed.
5. Do not run `supabase db push`, bulk migration replay, or deploy all repository functions to the Edge Node.
6. Reconcile schema/table dependencies, function declarations, JWT settings and required secrets before enabling any deployment.

## Runtime and routing reconciliation snapshot — 13 October 2026

### Confirmed inventories

- Both Supabase projects report `ACTIVE_HEALTHY`; this is infrastructure status, not proof that every function or workflow succeeds.
- Edge Node public-table inventory contains 17 tables; the listed tables report zero rows. It has no recorded migrations.
- The Edge Node's two functions are active: `xbang-runtime-health` v1 (`verify_jwt=true`) and `xbang-live-pipeline` v1 (`verify_jwt=false`).
- The primary project has 266 migration records and 57 deployed functions, including `chatb2k-orchestrator` v28, `chatb2k-agent-router` v12, `chatb2k-sourcing-engine` v10, `digital-product-media-factory` v7, `flow-generation-gate` v10, `bigo-live-pipeline` v35, `chatb2k-ecosystem-tool-gateway` v2, and `chatb2k-agent-command-center` v2.

### BIGO pipeline must remain on the primary project for now

The active `.github/workflows/bigo-live-automation.yml` sets:

```text
PIPELINE_URL=https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/bigo-live-pipeline
```

This is consistent with the deployed primary `bigo-live-pipeline` v35, whose source validates a GitHub Actions OIDC token with issuer `https://token.actions.githubusercontent.com`, audience `chatb2k-live-pipeline`, repository `EliteFitness101/chatb2k-f9d8a04d`, `refs/heads/main`, and the exact workflow reference.

Do not repoint that workflow at the Edge Node's `xbang-live-pipeline`:

- The Edge Node function expects a static bearer token from `XBANG_INGEST_KEY` and requires `client_key: "xbang"`; the current workflow sends an OIDC token and a ChatB2K/BIGO payload.
- The Edge Node function writes to `public.xbang_highlights`, `public.xbang_content_assets`, and `public.xbang_content_queue`. These tables were not present in the Edge Node's returned public-table inventory.
- The Edge Node inventory does not establish that the required `XBANG_INGEST_KEY` or service-role configuration is correctly provisioned. Secret values must never be exposed in logs or source.
- No Edge Function log source appeared in the queried Edge Node log-source summary for 12 October UTC; therefore there is no successful or failed invocation evidence in that query to certify this function.

These are source/schema/auth contract mismatches. They strongly suggest that the Edge Node XBang pipeline is not a drop-in replacement for the primary BIGO pipeline; verify its table dependencies and invoke it only in a controlled test environment before any cutover.

### Security findings to resolve before wider use

The Edge Node security advisor reported (observed 12 October 2026 at 23:03 UTC):

- Seven public tables with RLS enabled but no policies: `earnings`, `nigeria_steel_inventory`, `payments`, `rf_architects`, `rf_leads`, `rf_orders`, and `subscriptions`.
- `public.rls_auto_enable()` is a `SECURITY DEFINER` function executable by both `anon` and `authenticated` roles.

Review the intended server/client access model before changing policies or grants. Do not make blanket policy changes or revoke privileges without verifying application dependencies.

## Reconciliation decisions

1. Dashboard GitHub integration can be connected to the active ChatB2K repository with production deployment and automatic branching disabled.
2. The PR's CLI project target change is not evidence that the dashboard connection succeeded and does not deploy functions.
3. Keep commerce/payment/catalog/entitlement/paid-delivery authority in `resonance-fitness`.
4. Keep BIGO on the primary project's `bigo-live-pipeline` until a separate, tested migration plan proves equivalent OIDC authentication, table/schema compatibility, idempotency, storage contract and rollback.
5. Before using Edge Node as a ChatB2K runtime target, produce a per-function manifest of required tables, JWT mode, secrets, event contracts and owning project; then implement only reviewed, additive schema/function changes.
6. Treat the Edge Node security findings as a pre-production gate for any newly exposed customer, payment or order data.

The `project_id` in `supabase/config.toml` is the intended CLI target; it does **not** by itself authorize or complete the Dashboard GitHub integration. Dashboard authorization and repository selection remain separate steps. This document records an audit snapshot, not production certification.


### Additional source/runtime drift confirmed — 13 October 2026

- Primary Supabase currently reports deployed `chatb2k-orchestrator` v28.
- The active repository's default branch still points `supabase/config.toml` to the primary project, but fetching `supabase/functions/chatb2k-orchestrator/index.ts` from `main` returns NOT_FOUND. The deployed v28 implementation is therefore not present at that path on current `main`.
- Open draft PR #33 proposes adding the deployed v26 source baseline and an Omni-State evaluator; its own release notes state that it is not merged/deployed and that the evaluator is not yet integrated into production authorization.

This means the repository is not yet a reproducible source baseline for the deployed orchestrator. Before enabling any deployment integration, recover and review the exact deployed v28 source (or explicitly approve a versioned rollback/upgrade plan), compare its hash and dependencies with the target branch, and ensure deployment cannot unintentionally replace v28 with v26 or a different implementation. Do not treat the v26 PR as equivalent to deployed v28.
