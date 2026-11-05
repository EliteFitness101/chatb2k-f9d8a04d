# ResoFit ecosystem authority and retirement directive

**Effective date:** 2026-10-20  
**Owner:** Engr. Onyebuchi Jerry Moses (Coach B2K / lordB2K)  
**Change class:** Governance patch and retirement plan; no production API cutover.

## Canonical authority
- Canonical API: `https://resofit.fit/api/*`. Do not establish `resofit-api` or `api.resofit.fit` as competing production authorities.
- Primary system of record and commerce backend: Supabase `resonance-fitness`, ref `vbqjvmnhdtdhmeeudqnn`.
- Secondary orchestration/durable ingestion: ResoFlex Edge Node, ref `xtgteviwtoupbfvorrmk`; it does not replace the commerce database.
- Active ChatB2K source for this track: `EliteFitness101/chatb2k-f9d8a04d`.
- GitHub App installation ID: `153827553`. Installation scope must remain intentional; installation does not prove every selected repository is a production dependency.
- Reuse existing OpenAI, Gemini, GitHub App, Buffer, Shopify, Dropbox, Vercel, Supabase and automation credentials through server-side secret stores only. Never copy key values into source, SQL, client bundles, manifests or logs.
- Reuse established Omni-dimensional orchestration. Do not introduce duplicate API authorities, webhook receivers, schedulers or commerce ledgers.

## Verified mappings to preserve pending final eight-pair reconciliation

| Source | Verified project/domain | Treatment |
|---|---|---|
| `EliteFitness101/chatb2k-f9d8a04d` | ChatB2K source; `chatb2k.resofit.fit` currently maps to Vercel project `chatb2k` | Preserve source; reconcile source/project mismatch and prove webhook acceptance. |
| `EliteFitness101/shopb2k` | `reso-web`; `resofit.fit`, `www.resofit.fit` | Preserve canonical frontend/API surface. |
| `EliteFitness101/reso-dash` | `reso-dash`; `dashboard.resofit.fit` | Preserve; dashboard health must be derived from live telemetry. |
| `EliteFitness101/resocatalog` | `resocatalog`; `catalog.resofit.fit` | Preserve catalog. |
| `EliteFitness101/shop-resoflex` | `shop-resoflex`; `store.resofit.fit` | Preserve storefront. |
| Supabase `resonance-fitness` | Canonical system-of-record | Preserve. |
| Supabase `xtgteviwtoupbfvorrmk` | Secondary Edge Node | Preserve; keep isolated from commerce authority. |

The GitHub App currently reports 10 selected repositories. Reconcile the intended eight active repository/project pairs against domains, deployment sources, workflow schedules, secret consumers, Supabase registries/functions, and last successful production execution before removing App access. Do not arbitrarily choose two to drop.

## Retirement candidate: Vercel `resofit-api`

Observed project ID `prj_b6IVjIos1q2RaXhihICrhj5hEOgL`; Vercel reports `live: false`, latest production-target deployment `ERROR`, and only generated Vercel URLs (no canonical custom domain). GitHub lookup for `EliteFitness101/resofit-api` returned 404 through the connected GitHub identity.

**Disposition: non-production retirement candidate; not the canonical API.** Keep consumers on `https://resofit.fit/api/*`. Before retiring the Vercel project, preserve logs/deployment evidence and check rewrites, environment consumers, webhooks, scheduled jobs, external clients, domain assignments and Supabase references. Do not delete it as a substitute for this check.

## Legacy repository candidate

`EliteFitness101/chatb2k` is a separate, unarchived repository (metadata reports 47,484 KB) and is not the active source in the ChatB2K App installation inventory. Preserve it as a legacy archive candidate until production workflows, App bindings, deployment source, secrets and unique code are reconciled against `chatb2k-f9d8a04d`. Do not operate two webhook authorities.

## Duplicate Vercel project candidates

Team inventory includes similarly named projects: `joy-funnel-ai`, `joy-funnel-ai-u5vw`, `joy-funnel-ai-rljw`; `nownowgym`, `nownowgym-p1ep` and additional `nownowgym-*`; `resonance-fitness-automation` and `resonance-fitness-automation-oage`; and `elite` / `elite101`. Names alone do not justify retirement. Map Git source, domains, last successful deployment, secret consumers, Supabase references and scheduled workflows first.

## Execution policy
1. Preserve this policy in review until the eight canonical pairs are explicitly reconciled.
2. For each retirement candidate, capture repository metadata, domains, deployment state, last production activity, workflow/consumer references and Supabase references.
3. If proven unused, archive the GitHub repository and retire its Vercel project using supported platform controls. Preserve source history and required evidence.
4. Remove App installation access only after the final dependency check.
5. Verify canonical API consumers still resolve through `https://resofit.fit/api/*`; run read-only smoke tests and safe authenticated test flows.
6. Record timestamp, commit SHA, resource identifiers, evidence links and final status in the CEO manifest.

## Reporting contract
Distinguish configured, deployed, live-serving and end-to-end verified. A READY deployment, registered project, API key presence or HTTP 200 alone does not prove downstream execution. Do not claim agent capacity, rights clearance, payment settlement, provider delivery or dashboard freshness without current execution records. Clearance must be evidence-backed; never hardcode `rights=true`, `blockers=false` or unrestricted publication.

## Current state
This is a governance patch, not a claim that retirement is complete. Evidence supports treating `resofit-api` as a non-live retirement candidate, but the GitHub repo lookup did not resolve and the available platform actions did not expose a direct archive operation. No repository/project was deleted and no canonical production route was changed.
