# ChatB2K Universal Authorized Configuration Engine (UACE)

## What is implemented in this branch

`src/lib/chatb2k/universal-config-engine.ts` is the first policy/planning layer for a text- or voice-transcribed command. It classifies provider, intent, environment and risk; creates a structured plan with scope hints and verification; requires approval for staging and production writes; blocks destructive and ambiguous multi-provider actions; and emits a correlation ID plus mandatory guardrails.

Policy and credential broker tests are in `tests/chatb2k/`. The stable ID is for correlation only, not a cryptographic signature.

**This is not yet an autonomous configuration agent.** An authenticated plan-only gateway and short-lived exact-plan approval-record endpoint exist, plus read-only provider inspection adapters. No provider write adapters, managed vault integration, task queue, or voice capture are enabled. Provider API credentials must be set in server-side secret stores and verified before any write execution can be considered.

## Command contract

Examples:
- `Inspect GitHub workflow status`
- `Verify Cloudflare R2 private bucket access in staging`
- `Configure production Vercel environment variables`
- `Archive approved media to Google Drive and verify checksums`

The input layer should send the transcript and authenticated actor identity to a server endpoint. The endpoint returns a plan first. For multi-provider requests, split the task into a dependency graph with one provider per step and block until every target is unambiguous.

## Required server-side architecture

1. **Authenticated command gateway** — accepts a signed-in actor's text/transcript; applies RBAC and rate limits. Voice transcription is input, not authorization.
2. **Intent and plan service** — calls this pure policy module; emits a plan preview with targets, risk, scopes, expected changes, and verification.
3. **Approval service** — stores approval against a cryptographic hash of the canonical plan, actor, exact target, scopes, expiry, and one-time nonce. Any plan change invalidates approval.
4. **Credential broker** — retrieves provider credentials server-side from a managed vault. Prefer OAuth with narrow scopes or short-lived credentials. Never accept raw secrets in chat or model prompts.
5. **Provider adapters** — separate Cloudflare R2, GitHub, Vercel, Supabase, Buffer, and Google Drive adapters. Each validates account/project/repository/bucket/channel allowlists, required scopes, and idempotency before execution.
6. **Task queue** — durable job IDs, bounded retries, backoff, per-provider concurrency limits, timeouts, cancellation, and idempotency.
7. **Evidence verifier** — independently reads resulting state back from the provider. A queued action, HTTP success, or deployment creation is not proof of success.
8. **Append-only audit** — actor, plan hash, approval, provider, operation, resource identifier, timestamps, outcome, evidence pointer, and redacted error. Never record secrets, authorization headers, refresh tokens, or signed URLs.
9. **Observability and recovery** — alert on repeated failures, permission drift, budget thresholds, stale credentials, and verification mismatches. Support dry-run, rollback plan, and operator stop switch.

## Mandatory operation classes

| Class | Examples | Default policy |
|---|---|---|
| Read | inspect deployment, list channels, verify object | Allow only with valid identity, read scope, and resource allowlist |
| Staging write | create test bucket, write test object | Require scoped authorization, preflight, and cleanup/rollback |
| Production write | update live environment variables, publish, deploy | Require explicit approval for the exact plan and target |
| Destructive | delete data, revoke credentials, change DNS, public exposure, merge/cutover | Block by default; separate reviewed plan, explicit approval, backup and rollback required |

Never infer permission from the phrase “do it”, a voiceprint, or the presence of a connector. Existing ChatGPT connector access does not automatically grant runtime access to ChatB2K.

## Initial provider adapter milestones

- **GitHub:** repository allowlist, workflow run/read, branch + PR creation, Actions secret administration through approved APIs. Secret values must never be read back or logged.
- **Vercel:** project allowlist, deployment/log inspection, server-side environment variable writes only after approval. Never place private provider keys in `VITE_*` or browser-visible config.
- **Supabase:** canonical project allowlist; read-only audit first; schema/function changes through reviewed migration or versioned function deploy. Do not expose service-role keys to clients.
- **Cloudflare R2:** separate private/public buckets; test with a private test bucket first; bucket-scoped S3 credentials; prove PUT/HEAD/GET/checksum and cleanup before media routing changes.
- **Google Drive:** OAuth to the designated archive folder with the narrowest supported scope; upload, retrieve, checksum, and verify ownership before marking archived.
- **Buffer:** authorized workspace/channel scopes; preview schedule and target channels; publishing requires explicit approval unless a separately approved campaign policy exists.

## Rollout sequence and acceptance gates

1. Run unit tests and project build on this branch.
2. Implement a server-only command endpoint and durable approval/audit storage. Do not expose execution functions to the client bundle.
3. Read-only inspection adapters are present for GitHub, Vercel, Supabase Auth health, Cloudflare R2 bucket metadata, Google Drive folder listing, and Buffer account metadata; verify each using authorized sandbox credentials.
4. Run authenticated endpoint smoke tests after applying the additive migration to an approved non-production Supabase target; prove unauthorized deny cases and successful audit writes.
5. Add a managed credential vault and validate token scope, rotation, revocation, and expiry.
6. Enable staging writes only after approvals and audit verification work.
7. Test production approval, timeout, duplicate request, partial failure, rollback, and operator kill switch.
8. Keep the feature disabled by default until security review and end-to-end evidence are attached to the pull request.

## ResoFit-specific guardrails

- Do not switch BIGO media away from Vercel Blob until the deployed Supabase pipeline's current `blob_url` contract is located and tested, R2 upload/read-back is proven, Google Drive archive integrity is proven, and a reversible cutover is approved.
- Do not change canonical domain, existing routes, tables, functions, or provider mappings as a side effect of this engine.
- Preserve “Audit → Additive Patch → Verify” and report evidence as path + commit/deployment identifier + verification result.
- The current pull request is draft; this code is not production-enabled and no live credentials/resources were changed.
