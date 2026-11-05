# Gemini API + ChatB2K MCP

## Runtime layout

- `chatb2k-mcp`: stateless Streamable HTTP MCP endpoint. It authenticates a Supabase user JWT and permits CEO/fallback/admin/super_admin identities only.
- `chatb2k-gemini-orchestrator`: validates the same user session, reads the Gemini API key through the existing allowlisted Vault RPC, and starts an Antigravity Managed Agent interaction with the ChatB2K MCP server attached.
- Agent-to-gateway calls use the existing service-role-only gateway internally. The gateway remains read-only and applies each agent's registry allowlist.

## MCP tool surface

Read tools: ecosystem status, inventory, integration health, media routes, secret-reference presence, persisted sync snapshot, agent tool listing and allowlisted read-tool invocation.

Governed proposal: `ecosystem_propose_function` records a function proposal only. It does not generate code, deploy or execute.

## Explicit non-capabilities

The existing gateway has payments, deployment mutations, repository writes and email sending disabled. No generic command, service-role, arbitrary SQL, payment, publishing, deployment or repository-write tool is exposed by this MCP endpoint. A separate approval-backed dispatcher is required before autonomous mutations can be enabled.

## Gemini model/agent compatibility

The remote MCP connection uses `antigravity-preview-09-2026` through the Gemini Interactions API. Do not replace it with a Gemini 3 model for remote MCP: Google's current Interactions documentation says Gemini 3 models do not support remote MCP.

## Endpoints after deployment

- MCP: `https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-mcp`
- Gemini orchestrator: `https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-gemini-orchestrator`

Both functions use `verify_jwt=false` only because they validate the caller's Supabase JWT and administrator identity inside the function. Never remove that in-function authorization.
