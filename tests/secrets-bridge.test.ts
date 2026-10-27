import { describe, expect, it } from "vitest";
import { createSecretsBridge } from "../src/lib/secrets-bridge";

const env = () => ({
  GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
  GITHUB_ALLOWED_REPOSITORIES: "EliteFitness101/chatb2k-f9d8a04d, EliteFitness101/shopb2k",
  GITHUB_ALLOWED_INSTALLATION_IDS: "5314736",
  RESOFLEX_EDGE_SUPABASE_URL: "https://example.supabase.co",
  RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY: "fake-test-key",
});

describe("createSecretsBridge", () => {
  it("requires an explicit environment object", () => {
    expect(() => createSecretsBridge(undefined as never)).toThrow(/Explicit runtime bindings/);
  });
  it("rejects malformed repository allowlists rather than filtering invalid entries", () => {
    expect(() => createSecretsBridge({ ...env(), GITHUB_ALLOWED_REPOSITORIES: "invalid" }).getAllowedRepositories()).toThrow(/owner\/repo/);
  });
  it("normalizes repository names and rejects duplicates", () => {
    expect(createSecretsBridge({ ...env(), GITHUB_ALLOWED_REPOSITORIES: "EliteFitness101/ShopB2K" }).getAllowedRepositories()).toEqual(["elitefitness101/shopb2k"]);
    expect(() => createSecretsBridge({ ...env(), GITHUB_ALLOWED_REPOSITORIES: "A/B,a/b" }).getAllowedRepositories()).toThrow(/duplicates/);
  });
  it("validates installation IDs strictly", () => {
    expect(createSecretsBridge(env()).getAllowedInstallationIds()).toEqual(["5314736"]);
    expect(() => createSecretsBridge({ ...env(), GITHUB_ALLOWED_INSTALLATION_IDS: "1,not-an-id" }).getAllowedInstallationIds()).toThrow(/positive integer IDs/);
  });
  it("validates Supabase URL and requires service role key", () => {
    expect(createSecretsBridge(env()).getSupabaseUrl()).toBe("https://example.supabase.co");
    expect(() => createSecretsBridge({ ...env(), RESOFLEX_EDGE_SUPABASE_URL: "http://example.com" }).getSupabaseUrl()).toThrow(/HTTPS/);
    expect(() => createSecretsBridge({ ...env(), RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY: "" }).getSupabaseServiceRoleKey()).toThrow(/Missing required/);
  });
  it("does not share values across bridge instances", () => {
    expect(createSecretsBridge(env()).getGitHubWebhookSecret()).not.toBe(createSecretsBridge({ ...env(), GITHUB_WEBHOOK_SECRET: "another-secret" }).getGitHubWebhookSecret());
  });
  it("validates optional media HMAC secret length and account ID", () => {
    expect(() => createSecretsBridge({ CLOUDFLARE_ACCOUNT_ID: "bad" }).getCloudflareAccountId()).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
    expect(() => createSecretsBridge({ MEDIA_HMAC_SECRET: "short" }).getMediaHmacSecret()).toThrow(/32 UTF-8 bytes/);
  });
});
