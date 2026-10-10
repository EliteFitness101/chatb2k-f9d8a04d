/**
 * Server-only credential broker and adapter capability checks for UACE.
 * Never return secret values, and fail closed when a provider credential is absent.
 */
import type { Provider } from "@/lib/chatb2k/universal-config-engine";

const SERVER_CREDENTIALS: Record<Provider, string[]> = {
  "cloudflare-r2": ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
  github: ["CHATB2K_GITHUB_TOKEN"],
  vercel: ["VERCEL_TOKEN"],
  supabase: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  buffer: ["BUFFER_ACCESS_TOKEN"],
  "google-drive": ["GOOGLE_DRIVE_REFRESH_TOKEN", "GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET"],
};

export interface ProviderReadiness {
  provider: Provider;
  configured: boolean;
  missing: string[];
  executionEnabled: false;
  note: string;
}

/** Presence-only check: values are never returned, logged, or sent to callers. */
export function inspectProviderReadiness(provider: Provider): ProviderReadiness {
  const required = SERVER_CREDENTIALS[provider];
  const missing = required.filter((name) => !process.env[name]?.trim());
  return {
    provider,
    configured: missing.length === 0,
    missing,
    executionEnabled: false,
    note: "Credential presence does not prove validity or authorization. Adapter execution remains disabled until provider-specific verification and approval are implemented.",
  };
}

export function assertProviderReadyForReadOnly(provider: Provider): void {
  const status = inspectProviderReadiness(provider);
  if (!status.configured) {
    throw new Error(`Provider ${provider} is not configured; missing server-side variables: ${status.missing.join(", ")}`);
  }
  throw new Error(`Provider ${provider} read-only adapter is not implemented; fail-closed by design`);
}
