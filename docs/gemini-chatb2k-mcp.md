# Gemini API + ChatB2K MCP

## Runtime layout

- `chatb2k-mcp` is a stateless Streamable HTTP MCP endpoint. It validates a short-lived, scoped Supabase JWT and restricts callers to the CEO/fallback/admin/super-admin identities.
- `chatb2k-gemini-orchestrator` validates the caller's Supabase session, creates a five-minute MCP-scoped token, and starts the Gemini Interactions API remote-agent flow with ChatB2K MCP attached.
- The Vercel route `/api/internal/chatb2k/gemini-orchestrator` also contains an OpenAI Responses API provider path. The Supabase Edge proxy currently returns an explicit 503 for `provider: "openai"` until the Vercel production route is deployed and verified. Do not remove that guard based only on source presence.
- Agent-to-gateway calls use the service-role-only `chatb2k-ecosystem-tool-gateway`. The gateway is not read-only: it exposes a governed root tool surface, while payment mutations and email sending remain disabled.

## MCP tool surface

Read tools include ecosystem status, inventory, integration health, media routes, secret-reference presence, persisted sync snapshots, agent tool listing and allowlisted read-tool invocation.

`ecosystem_propose_function` records a function-scaffold proposal only. It does not generate code, deploy or execute a function.

`agent_tool_list` and `agent_tool_invoke` delegate to the internal gateway. The gateway enforces:
- Service-role-only internal authentication.
- Enabled-agent, health and kill-switch checks.
- Per-agent registry allowlists for non-root tools.
- `ROOT` / `GLOBAL_ADMIN` permission checks for elevated tools.
- Explicit endpoint and HTTP-method allowlists for GitHub and Vercel operations.
- Runtime-verified binding status before execution.
- Idempotency keys for binding execution and a maximum execution batch of 25 bindings (planning supports up to 72).
- Audit records for gateway actions.

The elevated root tool surface includes GitHub App status, repository reads/writes, GitHub Actions workflow dispatch, verified binding orchestration, Vercel project writes, deployment creation and deployment promotion. These are governed capabilities, not unrestricted shell, SQL or service-role access.

## Explicitly gated capabilities

- Payment mutations: disabled.
- Email sending: disabled.
- Arbitrary SQL, generic shell/command execution and unrestricted service-role access: not exposed.
- Function-scaffold proposal: proposal persistence only; code generation, CI, security review and deployment remain separate steps.
- A binding whose registry status is not `runtime_verified` is not executed.

Do not describe the entire MCP/gateway path as read-only. Distinguish the read-only tools, proposal-only tool, root-governed write/dispatch tools and separately disabled payment/email mutations.

## Gemini / OpenAI provider behavior

The Gemini path uses `antigravity-preview-09-2026` through the Gemini Interactions API. Keep the existing remote MCP-compatible agent until provider compatibility is verified; do not replace it with an incompatible model.

The OpenAI Responses API path is implemented in the Vercel route and uses `OPENAI_API_KEY` plus the same scoped MCP authorization. The Supabase Edge proxy's current OpenAI 503 guard is intentional until the production Vercel route is verified. Once that deployment is confirmed, remove the proxy guard in a feature branch, forward the provider unchanged, and test both provider paths end to end before release.

Credential separation:
- Gemini orchestration: `GEMINI_AUTOMATION_API_KEY`.
- Internal media generation/enrichment: `GEMINI_API_KEY`.
- OpenAI orchestration: `OPENAI_API_KEY`.

## CORS and browser origins

- `chatb2k-mcp`: `https://chatb2k.resofit.fit`.
- `chatb2k-agent-command-center` and `chatb2k-omnidimensional-control-plane`: `https://dashboard.resofit.fit`.
- `chatb2k-ecosystem-tool-gateway` is a service-role-only server-to-server endpoint; its browser CORS policy is not a substitute for gateway authorization.

Add a new browser origin only when the calling UI actually invokes that endpoint, and use an explicit origin allowlist. Never replace the origin policy with wildcard CORS for privileged endpoints.

## Endpoints

- MCP: `https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-mcp`
- Gemini orchestrator: `https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-gemini-orchestrator`
- Internal gateway: `https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-ecosystem-tool-gateway`

These are source-configured endpoint references. They do not, by themselves, prove that the deployed function version is current or that runtime execution succeeds.

The MCP and orchestrator functions use `verify_jwt=false` only because they validate the caller's JWT and administrator identity inside the function. Never remove that in-function authorization.
