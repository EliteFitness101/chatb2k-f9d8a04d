/**
 * ChatB2K Universal Authorized Configuration Engine (UACE)
 *
 * Provider-neutral command planner. This module deliberately does not store or
 * retrieve secrets and does not execute provider mutations. Production adapters
 * must run server-side, resolve credentials from a vault, enforce scopes, and
 * apply the approval decision returned by this policy layer.
 */
export type Provider =
  | "cloudflare-r2"
  | "github"
  | "vercel"
  | "supabase"
  | "buffer"
  | "google-drive";

export type Risk = "read" | "staging-write" | "production-write" | "destructive";
export type ApprovalState = "not-required" | "required" | "blocked";

export interface ConfigCommand {
  raw: string;
  intent: "inspect" | "configure" | "verify" | "archive" | "publish" | "unknown";
  provider: Provider | "multi-provider" | "unknown";
  target?: string;
  environment: "read-only" | "staging" | "production" | "unspecified";
  requestedActions: string[];
}

export interface PlannedStep {
  id: string;
  provider: Provider;
  operation: string;
  target: string;
  risk: Risk;
  requiresCredential: boolean;
  requiredScopes: string[];
  verification: string[];
}

export interface ExecutionPlan {
  planId: string;
  command: ConfigCommand;
  steps: PlannedStep[];
  approval: ApprovalState;
  approvalReason: string;
  executionAllowed: false;
  guardrails: string[];
}

const PROVIDERS: Record<Provider, { aliases: string[]; defaultScopes: string[] }> = {
  "cloudflare-r2": { aliases: ["cloudflare", "r2", "object storage", "bucket"], defaultScopes: ["bucket:scoped-object-read", "bucket:scoped-object-write"] },
  github: { aliases: ["github", "actions", "repository", "repo", "secrets"], defaultScopes: ["contents:read", "actions:read"] },
  vercel: { aliases: ["vercel", "deployment", "deployments", "environment variables"], defaultScopes: ["project:read", "deployment:read"] },
  supabase: { aliases: ["supabase", "database", "edge function", "rls"], defaultScopes: ["project:read", "database:read"] },
  buffer: { aliases: ["buffer", "social", "channel", "post", "publishing"], defaultScopes: ["channels:read", "posts:read"] },
  "google-drive": { aliases: ["google drive", "drive", "archive", "mcb"], defaultScopes: ["drive.file"] },
};

const MUTATION_WORDS = /\b(create|provision|configure|connect|add|write|update|rotate|publish|deploy|enable|grant|migrate|switch|cut.?over|delete|remove|revoke|overwrite|merge)\b/i;
const DESTRUCTIVE_WORDS = /\b(delete|remove|revoke|overwrite|drop|truncate|purge|destroy)\b/i;
const PROD_WORDS = /\b(production|prod|live|canonical|customer-facing|real customers)\b/i;
const STAGING_WORDS = /\b(staging|stage|sandbox|test|preview|dry.?run)\b/i;
const INSPECT_WORDS = /\b(inspect|audit|check|show|list|read|status|verify|validate|test|diagnose)\b/i;
const CONFIGURE_WORDS = /\b(create|provision|configure|connect|add|write|update|rotate|enable|grant|set up|setup)\b/i;
const VERIFY_WORDS = /\b(verify|validate|test|smoke test|prove|confirm)\b/i;
const ARCHIVE_WORDS = /\b(archive|backup|back up|sync to drive)\b/i;
const PUBLISH_WORDS = /\b(publish|post|schedule|send to channels)\b/i;

export function parseConfigCommand(raw: string): ConfigCommand {
  const text = raw.trim();
  const normalized = text.toLowerCase();
  const matched = (Object.entries(PROVIDERS) as [Provider, (typeof PROVIDERS)[Provider]][])
    .filter(([, meta]) => meta.aliases.some((alias) => normalized.includes(alias)));
  const provider: ConfigCommand["provider"] =
    matched.length === 1 ? matched[0][0] : matched.length > 1 ? "multi-provider" : "unknown";

  let intent: ConfigCommand["intent"] = "unknown";
  if (ARCHIVE_WORDS.test(text)) intent = "archive";
  else if (PUBLISH_WORDS.test(text)) intent = "publish";
  else if (VERIFY_WORDS.test(text)) intent = "verify";
  else if (CONFIGURE_WORDS.test(text) || MUTATION_WORDS.test(text)) intent = "configure";
  else if (INSPECT_WORDS.test(text)) intent = "inspect";

  const environment: ConfigCommand["environment"] = PROD_WORDS.test(text)
    ? "production"
    : STAGING_WORDS.test(text)
      ? "staging"
      : intent === "inspect" || intent === "verify"
        ? "read-only"
        : "unspecified";

  const targetMatch = text.match(/\b(?:for|on|in|to|into|from)\s+([a-z0-9._/-]{2,80})/i);
  return {
    raw: text,
    intent,
    provider,
    target: targetMatch?.[1],
    environment,
    requestedActions: text ? [text] : [],
  };
}

/** Conservative classification: uncertainty never grants write permissions. */
export function classifyRisk(command: ConfigCommand): Risk {
  if (DESTRUCTIVE_WORDS.test(command.raw)) return "destructive";
  if (!MUTATION_WORDS.test(command.raw)) return "read";
  return command.environment === "production" ? "production-write" : "staging-write";
}

export function buildExecutionPlan(raw: string): ExecutionPlan {
  const command = parseConfigCommand(raw);
  const risk = classifyRisk(command);
  const isRecognized = command.provider !== "unknown" && command.provider !== "multi-provider";
  const provider = isRecognized ? (command.provider as Provider) : undefined;
  const target = command.target ?? (command.environment === "production" ? "production-target-unresolved" : "target-unresolved");
  const steps: PlannedStep[] = [];

  if (provider && command.intent !== "unknown") {
    const mutation = risk !== "read";
    const meta = PROVIDERS[provider];
    steps.push({
      id: "step-1",
      provider,
      operation: command.intent,
      target,
      risk,
      requiresCredential: true,
      requiredScopes: mutation
        ? meta.defaultScopes.map((scope) => scope.replace(":read", ":write"))
        : meta.defaultScopes,
      verification: [
        "Confirm authenticated provider identity and exact resource scope",
        "Record before-state and request correlation ID",
        "Verify provider response and independently read back resulting state",
        "Write redacted audit record with outcome and evidence reference",
      ],
    });
  }

  let approval: ApprovalState = "not-required";
  let approvalReason = "Read-only intent; execution still requires an authorized adapter and credential scope.";
  if (!isRecognized || command.intent === "unknown" || steps.length === 0) {
    approval = "blocked";
    approvalReason = "Provider or action is ambiguous. Resolve target and operation before any adapter can run.";
  } else if (risk === "destructive") {
    approval = "blocked";
    approvalReason = "Destructive actions are blocked by default; require a separately reviewed recovery plan and explicit scoped authorization.";
  } else if (risk === "production-write") {
    approval = "required";
    approvalReason = "Production mutations require explicit approval for this exact plan and target.";
  } else if (risk === "staging-write") {
    approval = "required";
    approvalReason = "Writes require a scoped authorization and successful preflight even in staging.";
  }

  return {
    planId: "uace-" + stableHash(textForHash(raw)),
    command,
    steps,
    approval,
    approvalReason,
    executionAllowed: false,
    guardrails: [
      "Planning only: this module cannot execute provider operations.",
      "Never accept raw credentials in command text, logs, model context, or client-side environment variables.",
      "Resolve secrets server-side from a managed vault; use short-lived credentials and least privilege.",
      "No production write without a human-approved plan hash, exact target, scope, expiry, and idempotency key.",
      "No deletion, public exposure, DNS change, migration, or cutover without separate approval and tested rollback.",
      "Verify by read-back; never infer success from an HTTP 2xx or queued deployment alone.",
      "Keep credentials and private media out of audit records; redact tokens, authorization headers, and signed URLs.",
    ],
  };
}

function textForHash(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Non-cryptographic stable identifier for UI correlation only; not a security signature. */
function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const PROVIDER_CAPABILITIES = Object.freeze({
  "cloudflare-r2": ["inspect bucket", "verify object read/write", "configure bucket after approval"],
  github: ["inspect repository and workflow", "manage Actions secrets after approval", "create branch and pull request"],
  vercel: ["inspect project and deployment", "manage server-side environment variables after approval", "deploy only after explicit approval"],
  supabase: ["inspect project/functions/advisors", "manage schema or functions only through reviewed migrations and approval"],
  buffer: ["inspect authorized channels", "schedule/publish only with channel scope and approval"],
  "google-drive": ["inspect authorized archive", "upload and read back with checksum", "never treat queued upload as archived"],
} satisfies Record<Provider, string[]>);
