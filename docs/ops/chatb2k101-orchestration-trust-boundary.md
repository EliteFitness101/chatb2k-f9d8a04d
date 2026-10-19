# ChatB2K GitHub webhook trust boundary

## Scope and authority

The TanStack Start receiver at `/api/public/webhooks/github` authenticates and durably persists GitHub deliveries only. It does not execute arbitrary commands, deploy projects, approve pull requests, or mark payments/fulfillment successful.

- Canonical financial/catalog authority remains the `resonance-fitness` Supabase project.
- The durable webhook inbox belongs on the separate ResoFlex Edge Node project `xtgteviwtoupbfvorrmk`.
- Each delivery is idempotent by GitHub's `X-GitHub-Delivery` ID.
- Verify `X-Hub-Signature-256` over the exact raw request body before parsing.
- The receiver allowlists the GitHub App installation ID, event types, and exact `owner/repo` names.
- Missing configuration or persistence failures return 503 so GitHub can retry.
- Processing workers must claim rows with a concurrency-safe lease/locking strategy, increment attempts, and move exhausted deliveries to `dead_letter`. Do not run business side effects directly in the HTTP receiver.

## Required server-only Vercel production variables

- `GITHUB_WEBHOOK_SECRET`: same random secret configured in the GitHub App webhook settings.
- `GITHUB_ALLOWED_INSTALLATION_IDS`: comma-separated numeric GitHub App installation IDs. Current intended installation: `153827553`; verify the installation is still correct before setting it.
- `GITHUB_ALLOWED_REPOSITORIES`: comma-separated exact `owner/repo` names for the selected installation.
- `RESOFLEX_EDGE_SUPABASE_URL`: URL of the Edge Node project only.
- `RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY`: Edge Node service-role key; server-only and never exposed to client bundles.

Never use the canonical commerce project's service-role key for this inbox. Never hardcode a service-role key in SQL, request headers in source, logs, or committed files.

## Rollout gates

1. Confirm the migration `ops/resoflex-edge/migrations/20261014080000_github_webhook_inbox.sql` is applied to project `xtgteviwtoupbfvorrmk` after confirming project identity.
2. Configure all five variables in Vercel Production and configure the GitHub App webhook to `https://chatb2k.resofit.fit/api/public/webhooks/github`.
3. Test missing/wrong signature (401), wrong installation ID (403), unsupported event type (403), non-allowlisted repository (403), duplicate delivery (202 with duplicate=true), persisted new delivery (202), and database outage (503).
4. Confirm an inbox row is visible through a service-role-only read and that retries/processing are observable.
5. Deploy the merged commit through the existing Vercel release path; verify the production target and canonical domain.
6. Do not claim end-to-end orchestration until a separately authorized worker processes an allowlisted event and emits a correlated trace.

The code change adds installation and event-type allowlists, but it does not configure Vercel secrets, change GitHub App subscriptions, apply migrations, or deploy to production.
