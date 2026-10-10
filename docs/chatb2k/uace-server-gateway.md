# UACE server gateway and security controls

## Added in this patch

- `POST /api/chatb2k/uace/command` requires a valid Supabase bearer session, accepts a bounded JSON command, creates a policy plan, and persists a redacted audit event. It never executes the plan.
- `src/lib/chatb2k/provider-credential-broker.server.ts` checks server-only environment variable presence for R2, GitHub, Vercel, Supabase, Buffer, and Google Drive. It never returns secret values. Presence is not treated as proof of validity.
- `supabase/migrations/202610100001_uace_audit_and_approvals.sql` adds isolated audit and approval tables with RLS enabled and no client policies.
- Tests cover fail-closed credential handling.

## Configuration contract

Configure secrets in provider-managed secret stores / Vercel server environment variables, never in command text or browser-visible `VITE_*` variables. Names expected by the initial broker:

- R2: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- GitHub: `CHATB2K_GITHUB_TOKEN`
- Vercel: `VERCEL_TOKEN`
- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Buffer: `BUFFER_ACCESS_TOKEN`
- Google Drive: `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`

These are names only; no values are included. Use the least-privilege scopes and resource allowlists documented in the UACE readiness guide.

## Explicit limitations / enablement gates

Provider-specific API adapters are not enabled by this patch. The credential broker intentionally throws for adapter execution even when variables are present. OAuth refresh, token validity, provider identity, target allowlists, approval consumption, and provider read-back tests must be implemented before any write is enabled. This is deliberate fail-closed behavior, not a claim of end-to-end provider integration.

The route requires the Supabase migration to be applied before it can return a successful plan response. Apply the migration through reviewed deployment workflow, then verify with an authenticated request and an unauthenticated deny test. Do not apply to production or deploy the route until the PR review/approval process authorizes it.
