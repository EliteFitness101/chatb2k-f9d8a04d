# Hardened Secrets Bridge — ChatB2K rollout

**Status:** feature-branch implementation; production behavior not verified.

## Runtime adapter
The GitHub webhook receiver is a server-side TanStack Start route using Node crypto. It passes a deliberately limited projection of Node/Vercel environment variables to `createSecretsBridge`; the bridge itself does not read `process.env`, keep global state, or expose a bulk configuration object.

## Required runtime variables
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_ALLOWED_REPOSITORIES` (comma-separated `owner/repo`, including the intended ChatB2K repositories)
- `GITHUB_ALLOWED_INSTALLATION_IDS` (comma-separated positive numeric installation IDs)
- `RESOFLEX_EDGE_SUPABASE_URL` (HTTPS)
- `RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY` (server-only)

Configuration errors fail closed with HTTP 503. Repository allowlist parsing rejects malformed entries and duplicates instead of silently filtering them. Existing signature verification, body size limit, event allowlist, delivery idempotency, durable inbox insert, and response behavior remain in place.

## Verification
Run `npm test -- --run tests/secrets-bridge.test.ts` or the repository's normal `npm test` command, then `npm run lint` and `npm run build`. CI evidence is required before merge. Do not use real credentials in tests.

No secrets were created or modified. Production webhook delivery and runtime environment values still require independent verification.
