# ResoFit ChatB2K Orchestrator — GitHub App setup

Last reviewed: 2026-10-25

## App identity

- **GitHub App:** ResoFit ChatB2K Orchestrator
- **Owner:** EliteFitness101
- **App ID:** 5314736
- **Installation ID:** 153827553
- **Production receiver:** `https://chatb2k.resofit.fit/api/public/webhooks/github`
- **Repository:** `EliteFitness101/chatb2k-f9d8a04d`
- **Durable inbox:** ResoFlex Edge Node Supabase project `xtgteviwtoupbfvorrmk`, table `public.github_webhook_inbox`

Never put the App private key, webhook secret, or service-role key in this document, source, issues, or logs.

## GitHub App configuration

Set the Homepage URL to `https://www.resofit.fit`, the Webhook URL to the production receiver above, and a unique webhook secret. Store that exact secret only in the GitHub App settings and Vercel server-side environment variable `GITHUB_WEBHOOK_SECRET`. Do not reuse the App private key.

Keep repository access limited to the selected installation repositories. The current installation inventory contains ten repositories; the receiver allowlist must be an explicit subset of that inventory and must match the Vercel production environment variable. The documented target allowlist is:

```text
EliteFitness101/chatb2k-f9d8a04d
EliteFitness101/shopb2k
EliteFitness101/reso-dash
EliteFitness101/reso-flex
EliteFitness101/shop-resoflex
EliteFitness101/resocatalog
EliteFitness101/elite101
EliteFitness101/redzone-recruit
EliteFitness101/nownowgym
EliteFitness101/joy-funnel-ai
```

If a repository is not intended for event-driven automation, remove it from both the GitHub App installation selection and the production allowlist. Never add a repository merely because it exists.

## Repository-scoped webhook events

The receiver accepts only events expected to include both an installation ID and a repository full name:

- `push`
- `pull_request`
- `pull_request_review`
- `pull_request_review_comment`
- `issues`
- `issue_comment`
- `check_run`
- `check_suite`
- `status`
- `commit_comment`
- `create`
- `delete`
- `deployment`
- `deployment_status`
- `fork`
- `label`
- `milestone`
- `release`
- `repository_dispatch`
- `workflow_run`
- `workflow_job`

Do not subscribe this receiver to `ping`, `installation`, or `installation_repositories`: those are app/account-level events and do not reliably carry the repository field required by this inbox schema. `workflow_dispatch` is a workflow trigger/API operation, not a webhook event type. Subscribe to the repository-scoped events above in GitHub App settings; the receiver rejects other event types.

## Vercel Production variables

In the `chatb2k` Vercel project, configure these server-only variables:

- `GITHUB_WEBHOOK_SECRET`: same secret as GitHub App > General > Webhook secret
- `GITHUB_ALLOWED_INSTALLATION_IDS`: `153827553`
- `GITHUB_ALLOWED_REPOSITORIES`: comma-separated exact repository names matching the intended selected scope above
- `RESOFLEX_EDGE_SUPABASE_URL`: URL for project `xtgteviwtoupbfvorrmk` only
- `RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY`: service-role key for that same Edge Node project only

The Edge Node service-role key must never be client-exposed, Vite-prefixed, committed, or logged. Do not use the main commerce project's service-role key for this inbox.

## Activation and verification

1. Apply `ops/resoflex-edge/migrations/20261014080000_github_webhook_inbox.sql` only to project `xtgteviwtoupbfvorrmk`. Verify the resulting table and grants.
2. Configure the five production variables and the GitHub App webhook URL/subscriptions.
3. Deploy the merged route through the existing `chatb2k` Vercel project.
4. Verify production responses: invalid signature `401`; missing configuration `503`; unsupported event or unallowlisted installation/repository `403`; valid event `202` and one durable row; duplicate delivery `202` without a second row; database failure `503`.
5. Verify the actual GitHub delivery record and matching inbox row before calling intake operational.
6. Intake only persists events. A separately authorized dispatcher must claim inbox rows, invoke an allowlisted action, and persist the correlated outcome before end-to-end orchestration is considered operational.

## Trust boundary

The receiver verifies HMAC SHA-256 over the raw request body using constant-time comparison, validates installation/repository/event allowlists, and persists idempotently by `X-GitHub-Delivery`. It does not execute arbitrary code or claim deployment, payment, or fulfillment success. Every downstream mutation must be mapped to an explicit allowed action and independently authorized.
