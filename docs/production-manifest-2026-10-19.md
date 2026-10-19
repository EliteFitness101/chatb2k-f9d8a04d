# ResoFit / ResoFlex CEO Production Manifest

**Audit timestamp:** 2026-10-19 22:57 UTC (database check timestamp)
**Scope:** ChatB2K GitHub App, ChatB2K Vercel project, ResoFlex Edge Node, mapped repositories/domains, and proposed Omni-State design.
**Status:** **D — INTEGRATION NOT PROVEN**. This manifest is evidence-led; a registered repository, READY deployment, installed extension, or HTTP 200 does not prove end-to-end execution.

## Executive disposition

Do not deploy the supplied SQL or `/api/edge/orchestrate` sample as written. It embeds a privileged service-role credential in a request header, unconditionally asserts rights/ownership/zero blockers, does not authenticate the sender, and does not durably persist or idempotently process events. Treat 12 Generals / 72 Workers as intended architecture, not verified runtime capacity.

`https://chatb2k.resofit.fit` is attached and Vercel reports `verified: true`. `https://elite.resofit.fit` was not present in the inspected `elite` project's production domain list; that list showed only `elite-nine-lac.vercel.app`. Do not claim the Elite hostname is deployed until its intended project/domain mapping is confirmed.

## Verified evidence

| Component | Observed evidence | Status |
|---|---|---|
| GitHub App | Installation ID `153827553`; installation inventory returns 10 repositories | A — configuration verified |
| ChatB2K Vercel | Project `chatb2k`; latest production-target deployment `READY`; commit `173af7233f3b5d5050e0ded89fce6b64819361a4` from `EliteFitness101/chatb2k-f9d8a04d`, branch `main` | A — deployment artifact exists |
| ChatB2K `live` flag | Project inspection returns `live: false` despite the READY production-target deployment | E — configuration discrepancy |
| ChatB2K domain | `chatb2k.resofit.fit`, `verified: true` | A — domain config verified |
| Elite domain | `elite.resofit.fit` absent from the inspected `elite` project domain inventory | D — not configured/proven |
| Edge Node project | Supabase `xtgteviwtoupbfvorrmk`, `ResoFlex-Edge-Node`, `ACTIVE_HEALTHY` | A — project health only |
| Durable webhook inbox | `public.github_webhook_inbox` exists; count was 0 at check time | D — delivery not proven |
| Omni-State table | `public.resoflex_omni_state` absent on the inspected Edge Node | C — not deployed |
| Extensions | `pg_cron 1.6.4` and `uuid-ossp 1.1` present; `pg_net` was not returned | D — ingestion dependency not proven |
| Omni/ChatB2K cron jobs | Query of `cron.job` returned no matching jobs | C — cron not configured |
| Reso-Dash | `dashboard.resofit.fit` verified on Vercel project `reso-dash`; live telemetry freshness not tested | D — integration not proven |
| `resofit-api` | Vercel project exists; only inspected domain is `resofit-api.vercel.app`; prior account evidence reported `live: false` and latest production deployment `ERROR` | E — not a live production dependency |

## GitHub App repository inventory

The current installation inventory returned 10 repositories, not eight. Preserve this observed inventory rather than silently assuming a different scope:

1. `EliteFitness101/chatb2k-f9d8a04d` — active ChatB2K source for this scope.
2. `EliteFitness101/shopb2k` — Edge/commerce orchestration; production role requires deployment confirmation.
3. `EliteFitness101/reso-dash` — dashboard/PWA.
4. `EliteFitness101/resocatalog` — catalog.
5. `EliteFitness101/shop-resoflex` — store.
6. `EliteFitness101/elite101` — Elite platform.
7. `EliteFitness101/redzone-recruit` — recruitment.
8. `EliteFitness101/nownowgym` — fitness platform.
9. `EliteFitness101/reso-flex` — ResoFlex platform.
10. `EliteFitness101/joy-funnel-ai` — funnel/AI project.

Custom domains verified in this audit:
- `chatb2k.resofit.fit` → Vercel project `chatb2k`.
- `resofit.fit` and `www.resofit.fit` → Vercel project `reso-web`.
- `dashboard.resofit.fit` → Vercel project `reso-dash`.
- `catalog.resofit.fit` → Vercel project `resocatalog`.
- `store.resofit.fit` → Vercel project `shop-resoflex`.

Do not infer custom domains for the other repositories from GitHub App installation alone. Verify each Vercel project and domain mapping before declaring it production-routed.

## Required safe design

### 1. Canonical durable webhook
- Use one canonical signed GitHub webhook receiver and Edge Node `public.github_webhook_inbox` as the durable secondary ingestion layer.
- Verify `X-Hub-Signature-256` against the raw body before parsing; validate event type, delivery ID, installation ID, repository allowlist, and event contract.
- Enforce uniqueness on GitHub delivery ID. Duplicate deliveries must not create duplicate workflow execution.
- Acknowledge only after durable persistence; return a retryable error when persistence fails.
- Never place a Supabase service-role key in SQL, request payloads, browser code, logs, or committed files. Use server-side secret configuration and least-privilege credentials. Rotate any privileged credential that was committed or exposed.
- Consolidate competing webhook implementations into one route; do not run parallel receivers that each claim authority.

### 2. Evidence-based rights and clearance
- Derive clearance from persisted asset/source ownership, rights evidence, reviewer identity, review timestamp, and policy version.
- Do not default `blockers_active` to false or ownership/rights/unrestricted fields to true.
- Missing or unknown rights evidence must not be represented as approval. A clearance record also does not prove a publishing provider accepted a post.

### 3. Real execution and telemetry
- Persist event ID, idempotency key, workflow state, attempt count, timestamps, and terminal result.
- Report agent health from observed heartbeats and completed jobs, not the declared 12 × 6 design.
- Distinguish `accepted`, `queued`, `running`, `succeeded`, `failed`, and `blocked`; queue acceptance is not success.
- Expose authenticated, read-scoped telemetry to Reso-Dash. Never expose privileged credentials or sensitive provider payloads.
- Before enabling cron, confirm extension availability, migration ownership, privileges, retries, and duplicate prevention. Use one scheduler authority per job.

### 4. Domain and deployment truth
- Keep `chatb2k.resofit.fit` as the verified ChatB2K hostname.
- Do not attach `elite.resofit.fit` to project `elite` until intended repo, project, and environment are confirmed.
- Resolve why Vercel reports `chatb2k.live = false` while its latest deployment is READY and targets production.
- Do not promote `resofit-api` as API authority while its live/deployment evidence is failing. The intended public API authority remains `https://www.resofit.fit/api/` unless explicitly re-approved.

## Additive patch and release sequence

1. Keep this evidence-led manifest on a dedicated review branch; do not overwrite production configuration during audit.
2. Advance the canonical signed webhook implementation and tests before applying database DDL.
3. After reviewing the current Edge Node schema and migration history, add only the required additive schema for inbox uniqueness, event receipt, execution attempts, and evidence-backed clearance references. Do not create a second event authority.
4. Test invalid signatures, wrong installation/repository, duplicate delivery, database failure, missing clearance evidence, worker retry, and telemetry consistency.
5. Deploy to preview first. Promote to production only after required checks and a real GitHub delivery acceptance test pass.
6. Record commit SHA, deployment ID, HTTP/test results, Edge Node inbox row, execution record, and dashboard freshness timestamp.

## Acceptance checklist

- [ ] Production route is confirmed on the intended project and hostname.
- [ ] Real GitHub App delivery passes signature and installation/repository validation.
- [ ] Delivery appears exactly once in `public.github_webhook_inbox`.
- [ ] Duplicate delivery causes no duplicate workflow execution.
- [ ] Accepted event reaches a real worker and records a terminal outcome.
- [ ] Missing ownership/rights evidence blocks publishing.
- [ ] An approved test asset reaches a provider sandbox or explicitly approved test destination and returns a provider receipt.
- [ ] Reso-Dash shows the same event/workflow state with a freshness timestamp.
- [ ] The chosen scheduler has a visible job definition and a run record proving execution.
- [ ] Vercel project/domain configuration and production deployment state are reconciled.

## CEO status

**Overall: D — INTEGRATION NOT PROVEN.** The ChatB2K domain and deployment artifact exist, and the Edge Node project is healthy. The proposed Omni-State table and matching cron jobs were not found; `pg_net` was not returned by the extension check; the durable inbox was empty at the time checked. The supplied sample does not authenticate, persist, or execute the described swarm and must not be used as proof of zero-flag publishing or “God Mode”.

**Next action:** advance the canonical signed webhook implementation, reconcile the Vercel `live` discrepancy, then prove a real GitHub App delivery through Edge Node persistence, worker execution, and Reso-Dash telemetry. Do not apply the supplied SQL as-is.

## Repair actions recorded after initial audit

- Canonical webhook PR branch `feat/chatb2k101-durable-webhook-inbox-20261014` was patched to validate the configured GitHub App installation ID and allow only `pull_request`, `pull_request_review`, `check_run`, `check_suite`, and `status` events before inbox persistence.
- CI source assertions were extended to cover installation and event-type allowlists. The trust-boundary document was updated.
- Vercel Production and Preview now contain the non-secret `GITHUB_ALLOWED_INSTALLATION_IDS=153827553` allowlist. The webhook secret, Edge Node URL, Edge Node service-role credential, and repository allowlist were already present by variable name; their values were not read or exposed in this report.
- Validation runs for the webhook branch are still in progress and Vercel reports the preview check as pending. This is a code/config patch, not a production deployment. The active production commit remains `173af7233f3b5d5050e0ded89fce6b64819361a4`, which does not contain the receiver route.
