import { describe, expect, it, vi, afterEach } from "vitest";
import { inspectProviderReadiness } from "@/lib/chatb2k/provider-credential-broker.server";

describe("UACE provider credential broker", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports missing server-side credentials by name only", () => {
    vi.stubEnv("CHATB2K_GITHUB_TOKEN", "");
    const status = inspectProviderReadiness("github");
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(["CHATB2K_GITHUB_TOKEN"]);
    expect(JSON.stringify(status)).not.toContain("ghp_");
    expect(status.executionEnabled).toBe(false);
  });

  it("does not enable execution when credentials are present", () => {
    vi.stubEnv("CHATB2K_GITHUB_TOKEN", "test-secret-not-real");
    const status = inspectProviderReadiness("github");
    expect(status.configured).toBe(true);
    expect(status.missing).toEqual([]);
    expect(status.executionEnabled).toBe(false);
  });
});
