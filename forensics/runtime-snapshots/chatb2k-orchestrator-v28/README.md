# ChatB2K orchestrator v28 runtime snapshot

- Source project: Supabase `resonance-fitness` (`vbqjvmnhdtdhmeeudqnn`, eu-west-1)
- Function slug: `chatb2k-orchestrator`
- Runtime status at capture: `ACTIVE`
- Runtime version: `28`
- Runtime updated at: `2026-10-12T21:23:09.366Z`
- Supabase-reported `ezbr_sha256`: `81e4774a1c821ed2485e50fa926583e884e7ee1679cf5f91334dc8e7626c14ea`
- JWT verification setting: `false`
- Runtime entrypoint: `index.ts`
- Captured: `2026-10-13` (UTC)
- Source retrieval: Supabase Edge Function runtime API; the expected `supabase/functions/chatb2k-orchestrator/index.ts` path was absent from repository `main` at capture.

## Scope and safety

This is an **evidence-preservation snapshot**, not an approved deployment. The source is intentionally stored under `forensics/runtime-snapshots/` to avoid accidentally changing the deployable function path. Do not copy it into the production function path, deploy it, or treat the runtime checksum as a checksum of the raw source file until an independent reproducible-build procedure verifies that relationship.

The function's source references environment variables and internal function endpoints by name; no secret values were captured. The snapshot preserves the source returned by the runtime endpoint and is not a substitute for dependency lockfiles, build configuration, or a deployment artifact.

## Required follow-up

1. Review this snapshot for security, data access, tool allowlists, and side effects.
2. Compare runtime behavior and dependencies with the intended repository source baseline.
3. Establish a reproducible build/deploy procedure and a versioned release plan.
4. Keep production deployment disabled until reviewers approve the source and deployment target.
