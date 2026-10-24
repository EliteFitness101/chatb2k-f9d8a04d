# ChatB2K Omnidimensional Control Plane

Production Edge Function: `chatb2k-omnidimensional-control-plane`

Canonical endpoint:
`https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-omnidimensional-control-plane`

## Purpose
Authenticated control-plane surface for ecosystem inventory snapshots, publishing telemetry, media-route discovery, secret-reference presence checks, and audited function-scaffold requests. It complements existing endpoints; it does not replace them.

## Authentication
- Supabase user session JWT required in `Authorization: Bearer <session>`.
- Caller must be CEO, fallback administrator, or a user with `admin` / `super_admin` role.
- Global kill-switch mutation is restricted to `ceo@resofit.fit` and `resonancefitnesswork@gmail.com`.
- Never send service-role keys, provider tokens, cookies, or secret values to a browser or in chat.
- The function is deployed with platform JWT verification disabled because it validates the user session itself. Requests without a valid user session are rejected.

## Actions
Send JSON `POST` with `action`:
- `health` — authenticated runtime health.
- `status` / `snapshot` — registered-source/route/agent state and 7-day publishing telemetry and Gemini budget/usage state; snapshot persisted in `chatb2k_automation_runs`.
- `inventory` — database registry plus live Supabase Management API function inventory only when `SUPABASE_ACCESS_TOKEN` is configured in this server runtime.
- `sync_state` — persist a registry snapshot and attribution/RSID preservation policy; does not claim that external connectors are synced.
- `media_routes` — list configured media/storage/CDN routes and probe the existing media control plane; does not upload or publish media.
- `integration_health` — bounded HEAD probes for canonical ResoFit, dashboard, ChatB2K, storefront and media CDN URLs plus a GET probe of the existing R2 control plane. Reachability is not end-to-end proof.
- `secret_inventory` — reports variable names and presence in this function runtime only; never returns values. Cross-project/Vault drift is not proven by this check.
- `kill_switch` — `{ "action": "kill_switch", "enabled": true|false, "reason": "..." }`. Global flag mutation is restricted to the two named accounts and is audited. Consumers must enforce the canonical flag; this action does not pause individual fan-outs.
- `propose_function` — `{ "action": "propose_function", "slug": "...", "purpose": "...", "integrations": [] }`. Persists a scaffold proposal; code creation, CI, review, and deployment remain separate steps.

## Evidence boundaries
- A deployed function count, source registry record, configured route, or scheduled queue entry is not by itself proof of successful end-to-end execution.
- This endpoint never automatically rewrites arbitrary code, copies secrets between providers, publishes media, or changes fan-out schedules.
- Preserve existing RSID/UTM/source/session attribution. Add missing attribution fields; do not replace established identifiers.
