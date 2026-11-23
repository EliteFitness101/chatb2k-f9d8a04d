# Telegram Integration C

## Scope and preservation

Additive implementation track for the ChatB2K Telegram Mini App and Bot API integration. Preserve all existing Telegram bot identities, Vault credentials, social destination records, Buffer publishing, and payment rails. The Mini App is hosted at https://chatb2k.resofit.fit/telegram. Purchases and plans continue through the existing product and checkout routes; this integration does not create or change payment products, prices, payment methods, or subscription entitlements.

## Verified client resolution

The Edge Function resolves the five currently active Telegram client destinations from `public.social_destinations` (`provider=telegram`, `platform=telegram`, `active=true`). It reads each destination's existing `auth_secret_ref` only through the existing `public.chatb2k_get_runtime_secret(p_name)` RPC. That accessor is already allowlisted for the five Telegram credential names and its EXECUTE privilege is restricted to `service_role`; do not expose it to `anon` or `authenticated`.

For each request, the function:
1. Retrieves the five active destination records and their server-side Vault credentials.
2. Validates Telegram `initData` against each token using Telegram's HMAC-SHA-256 procedure (HMAC key = bot token, message = `WebAppData`).
3. Requires exactly one valid token match.
4. Calls Telegram `getMe` for the matching token and confirms the returned bot username matches the registry entry.
5. Returns only the verified member identity, destination ID, client display name, bot username, and that bot's support URL. Bot tokens never leave the server.

The current active registry has five distinct bot usernames and five configured Vault secret references. The inactive legacy Elite Academy destination remains inactive and is not selected. A duplicate credential match, missing credential, registry count other than five, or bot-username mismatch fails closed.

## Security and rollout

- Supabase Edge Function uses the existing server-side `SUPABASE_SECRET_KEYS` default key (legacy service-role environment variable fallback only) to call the restricted credential accessor and read the active destination registry.
- Telegram signed launch data is validated server-side and rejected if stale (older than 24 hours), malformed, duplicated, or signed by a non-matching bot token.
- CORS is restricted to the canonical ChatB2K origin and the exact preview deployment hosts used for this rollout.
- No Vault token values, bot tokens, service-role keys, or payment credentials are committed to Git.
- No Telegram menu-button configuration is changed by this integration. Audit existing menus separately before any future menu mutation.
- Existing social destination rows, client names, bot usernames, secret references, Buffer publishing, payment rails, product prices, and checkout behavior are not modified.

## Verification gates

1. PR checks and Vercel preview build pass on the current head.
2. The Edge Function is deployed to the main Supabase project with custom Telegram HMAC validation enabled.
3. A signed launch from each of the five bots resolves to its matching destination and bot username.
4. Invalid, expired, malformed, and cross-client signed payloads are rejected.
5. Existing product browsing and checkout routes remain unchanged.
6. Production route and function are checked after deployment; only then may the release be certified.

Production certification requires real Telegram launches from all five bots. A green Vercel preview build alone is not sufficient.
