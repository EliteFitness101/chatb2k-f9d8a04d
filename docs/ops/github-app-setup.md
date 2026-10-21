# ResoFit ChatB2K Orchestrator — GitHub App setup

Last reviewed: 2026-10-16

## App identity

- **GitHub App name:** ResoFit ChatB2K Orchestrator
- **Owner:** EliteFitness101
- **App ID:** 5314736
- **Installation ID:** 153827553
- **Production webhook receiver:** `https://chatb2k.resofit.fit/api/public/webhooks/github`
- **Repository:** `EliteFitness101/chatb2k-f9d8a04d`
- **Webhook storage:** ResoFlex-Edge-Node Supabase project `xtgteviwtoupbfvorrmk`; table `public.github_webhook_inbox`

The Client ID is an OAuth identifier, not a webhook secret. Do not put the private key, webhook secret, or service-role key in this document, source code, issues, or logs.

## GitHub App > General

- Set the Homepage URL to `https://www.resofit.fit` (the canonical public ResoFit URL).
- Set the Webhook URL to `https://chatb2k.resofit.fit/api/public/webhooks/github`.
- Generate a new, unique Webhook secret in a password manager. Store the exact same value as the Vercel Production environment variable `GITHUB_WEBHOOK_SECRET`. Do not reuse the App private key as the webhook secret.
- Keep the App private key private; rotate it if it has ever been exposed.
- After changing permissions or subscribed events, accept GitHub's requested permission update for the existing installation.

## Repository permissions

Use these settings for the intended source-control and CI/CD orchestration scope. GitHub may label individual permissions differently as its UI evolves.

| Permission | Access | Why |
|---|---|---|
| Metadata | Read-only (required) | Repository identity and installation metadata |
| Contents | Read and write | Inspect code and commit controlled source updates |
| Pull requests | Read and write | Inspect, comment, label, and manage PR workflow |
| Issues | Read and write | Issue triage and automation |
| Actions | Read and write | Inspect and dispatch/re-run workflows |
| Workflows | Read and write | Update workflow files where authorized |
| Checks | Read and write | Publish/read check results |
| Commit statuses | Read and write | Report validation state |
| Deployments | Read and write | Create/read deployment records and statuses |
| Environments | Read-only | Inspect deployment environment metadata |
| Releases | Read and write, if exposed separately | Manage release metadata |
| Discussions | Read and write, only if used | Community/support automation |

Organization permissions: leave disabled unless a documented workflow needs them. Administration, secrets, variables, webhooks, members, and billing are not required for normal code/PR/Actions orchestration. Enable additional administrative permissions only when the app has an explicit, audited use case. GitHub App permissions cannot grant access to secret values.

## Subscribe to webhook events

Subscribe to the events used by the orchestrator. For a comprehensive source-control + CI/CD event stream, enable:

- `push`
- `pull_request`
- `pull_request_review`
- `pull_request_review_comment`
- `issues`
- `issue_comment`
- `check_run`
- `check_suite`
- `commit_comment`
- `create`
- `delete`
- `deployment`
- `deployment_status`
- `fork`
- `label`
- `milestone`
- `release`
- `repository`
- `repository_dispatch`
- `workflow_dispatch` (if offered as a subscription event; GitHub may expose workflow_dispatch as an API action rather than a webhook event)
- `workflow_run`
- `workflow_job`
- `ping`
- `installation`
- `installation_repositories`

Only subscribe to organization-level events such as `member` or `organization` if the app is installed at organization scope and a concrete workflow consumes them. A webhook subscription delivers events; it does not itself grant API permissions or authorize a deployment.

## Vercel Production environment variables

Set these in the `chatb2k` Vercel project, **Production** environment only (add Preview separately only when deliberately testing with a non-production secret and database):

- `GITHUB_WEBHOOK_SECRET` = the webhook secret from GitHub App > General
- `GITHUB_ALLOWED_REPOSITORIES` = comma-separated exact `owner/repo` names intended to be accepted by this receiver, for example `EliteFitness101/chatb2k-f9d8a04d,EliteFitness101/shopb2k,EliteFitness101/reso-dash,EliteFitness101/resocatalog,EliteFitness101/shop-resoflex,EliteFitness101/reso-flex,EliteFitness101/joy-funnel-ai,EliteFitness101/redzone-recruit,EliteFitness101/nownowgym`
- `RESOFLEX_EDGE_SUPABASE_URL` = the project URL for Edge Node project `xtgteviwtoupbfvorrmk`
- `RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY` = service-role key for that same Edge Node project

The example allowlist reflects the current nine-repository installation inventory observed on 2026-10-14. Reconcile it with the desired repository set before saving; the receiver must reject every repository not explicitly listed. Never expose the service-role key to a browser, Vite-prefixed variable, client bundle, commit, or log.

## Validation and activation sequence

1. Save App webhook URL, secret, permissions, and event subscriptions.
2. Accept the installation permission update if GitHub prompts for it.
3. Configure the four server-only Vercel Production variables.
4. Redeploy `chatb2k` so the production function receives the variables.
5. In GitHub App > Advanced, inspect recent deliveries and redeliver a test only after the endpoint is deployed.
6. Verify: invalid signature returns 401; missing config returns 503; non-allowlisted repository returns 403; valid delivery returns 202 and creates one inbox row; duplicate delivery ID returns 202 without creating a second row; database failure returns 503 so GitHub retries.
7. Verify a real delivery in `public.github_webhook_inbox` before marking end-to-end production setup complete.

## Current implementation boundary

The receiver authenticates the raw request body using HMAC SHA-256, compares signatures in constant time, checks the exact repository allowlist, and persists deliveries idempotently. It is an intake queue, not a general-purpose remote code executor. Downstream handlers must explicitly map event/action pairs to permitted workflows and independently validate authorization before writing code, changing settings, or deploying.

## Management links

- GitHub App settings: `https://github.com/settings/apps`
- Installation settings: `https://github.com/settings/installations/153827553`
- GitHub App webhook receiver: `https://chatb2k.resofit.fit/api/public/webhooks/github`
- PR #42: `https://github.com/EliteFitness101/chatb2k-f9d8a04d/pull/42`
