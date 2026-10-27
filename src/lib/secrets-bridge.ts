/**
 * Runtime-scoped server secrets bridge.
 * This module never reads process.env, caches globally, or exposes bulk config.
 */
export type RuntimeBindings = Record<string, unknown>;

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ACCOUNT_ID_RE = /^[a-fA-F0-9]{32}$/;
const DEFAULT_TOKEN_WINDOW = 3600;
const MAX_TOKEN_WINDOW = 604800;

function optionalString(env: RuntimeBindings, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") throw new Error(`[CONFIGURATION ERROR] ${key} must be a string`);
  return raw.trim() || undefined;
}
function requiredString(env: RuntimeBindings, key: string): string {
  const raw = env[key];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`[CONFIGURATION ERROR] Missing required configuration: ${key}`);
  }
  return raw;
}
function httpsUrl(env: RuntimeBindings, key: string): string | undefined {
  const raw = optionalString(env, key);
  if (!raw) return undefined;
  let parsed: URL;
  try { parsed = new URL(raw); } catch {
    throw new Error(`[CONFIGURATION ERROR] ${key} must be a valid URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`[CONFIGURATION ERROR] ${key} must be HTTPS without credentials or fragment`);
  }
  return parsed.toString().replace(/\/$/, "");
}
function repoAllowlist(env: RuntimeBindings): readonly string[] {
  const raw = requiredString(env, "GITHUB_ALLOWED_REPOSITORIES");
  const values = raw.split(",").map((value) => value.trim());
  if (values.some((value) => !value || !REPO_RE.test(value))) {
    throw new Error("[CONFIGURATION ERROR] GITHUB_ALLOWED_REPOSITORIES must contain only owner/repo entries");
  }
  const normalized = values.map((value) => value.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("[CONFIGURATION ERROR] GITHUB_ALLOWED_REPOSITORIES contains duplicates");
  }
  return Object.freeze(normalized);
}
function numericAllowlist(env: RuntimeBindings, key: string): readonly string[] {
  const raw = requiredString(env, key);
  const values = raw.split(",").map((value) => value.trim());
  if (values.some((value) => !/^\d+$/.test(value) || !/[1-9]/.test(value))) {
    throw new Error(`[CONFIGURATION ERROR] ${key} must be a comma-separated list of positive integer IDs`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`[CONFIGURATION ERROR] ${key} contains duplicates`);
  }
  return Object.freeze(values);
}
function tokenWindow(env: RuntimeBindings): number {
  const raw = env.TOKEN_VALIDITY_WINDOW_SECONDS;
  if (raw === undefined || raw === null || raw === "") return DEFAULT_TOKEN_WINDOW;
  const value = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!/^[1-9]\d*$/.test(value)) throw new Error("[CONFIGURATION ERROR] TOKEN_VALIDITY_WINDOW_SECONDS must be a positive integer");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_TOKEN_WINDOW) {
    throw new Error("[CONFIGURATION ERROR] TOKEN_VALIDITY_WINDOW_SECONDS must not exceed 604800");
  }
  return parsed;
}

export function createSecretsBridge(env: RuntimeBindings) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    throw new Error("[CONFIGURATION ERROR] Explicit runtime bindings object required");
  }
  return Object.freeze({
    getRequired: (key: "RESOFLEX_EDGE_SUPABASE_URL" | "RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY" | "GITHUB_WEBHOOK_SECRET" | "R2_BUCKET_NAME") => requiredString(env, key),
    getOptional: (key: "CLOUDFLARE_API_TOKEN" | "R2_REGION" | "GITHUB_APP_ID" | "GITHUB_CLIENT_ID" | "NODE_ENV") => optionalString(env, key),
    getCloudflareAccountId: () => {
      const value = requiredString(env, "CLOUDFLARE_ACCOUNT_ID");
      if (!ACCOUNT_ID_RE.test(value)) throw new Error("[CONFIGURATION ERROR] Invalid CLOUDFLARE_ACCOUNT_ID");
      return value;
    },
    getCloudflareApiToken: () => optionalString(env, "CLOUDFLARE_API_TOKEN"),
    getR2BucketName: () => requiredString(env, "R2_BUCKET_NAME"),
    getR2Endpoint: () => httpsUrl(env, "R2_S3_API_ENDPOINT"),
    getR2Region: () => optionalString(env, "R2_REGION") ?? "auto",
    getMediaDomain: () => httpsUrl(env, "NEXT_PUBLIC_MEDIA_DOMAIN"),
    getMediaHmacSecret: () => {
      const value = requiredString(env, "MEDIA_HMAC_SECRET");
      if (new TextEncoder().encode(value).byteLength < 32) {
        throw new Error("[CONFIGURATION ERROR] MEDIA_HMAC_SECRET must be at least 32 UTF-8 bytes");
      }
      return value;
    },
    getTokenValidityWindow: () => tokenWindow(env),
    getGitHubWebhookSecret: () => requiredString(env, "GITHUB_WEBHOOK_SECRET"),
    getAllowedRepositories: () => repoAllowlist(env),
    getAllowedInstallationIds: () => numericAllowlist(env, "GITHUB_ALLOWED_INSTALLATION_IDS"),
    getSupabaseUrl: () => httpsUrl(env, "RESOFLEX_EDGE_SUPABASE_URL") ?? (() => {
      throw new Error("[CONFIGURATION ERROR] Missing required configuration: RESOFLEX_EDGE_SUPABASE_URL");
    })(),
    getSupabaseServiceRoleKey: () => requiredString(env, "RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY"),
    getAppDomain: () => httpsUrl(env, "NEXT_PUBLIC_APP_DOMAIN"),
    getDashboardDomain: () => httpsUrl(env, "NEXT_PUBLIC_DASHBOARD_DOMAIN"),
    getStoreDomain: () => httpsUrl(env, "NEXT_PUBLIC_STORE_DOMAIN"),
    getShopDomain: () => httpsUrl(env, "NEXT_PUBLIC_SHOP_DOMAIN"),
    getNodeEnv: () => {
      const value = optionalString(env, "NODE_ENV") ?? "production";
      if (!["development", "test", "production"].includes(value)) {
        throw new Error("[CONFIGURATION ERROR] NODE_ENV must be development, test, or production");
      }
      return value;
    },
  });
}
