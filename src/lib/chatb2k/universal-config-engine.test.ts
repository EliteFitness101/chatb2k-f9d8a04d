import { describe, expect, it } from "vitest";
import {
  buildExecutionPlan,
  classifyRisk,
  parseConfigCommand,
} from "@/lib/chatb2k/universal-config-engine";

describe("ChatB2K Universal Authorized Configuration Engine", () => {
  it("routes a clear read-only provider inspection", () => {
    const command = parseConfigCommand("Inspect GitHub workflow status");
    expect(command.provider).toBe("github");
    expect(command.intent).toBe("inspect");
    expect(classifyRisk(command)).toBe("read");
    const plan = buildExecutionPlan("Inspect GitHub workflow status");
    expect(plan.approval).toBe("not-required");
    expect(plan.executionAllowed).toBe(false);
    expect(plan.steps).toHaveLength(1);
  });

  it("requires approval for production changes", () => {
    const plan = buildExecutionPlan("Configure production Vercel environment variables");
    expect(plan.command.provider).toBe("vercel");
    expect(plan.approval).toBe("required");
    expect(plan.steps[0]?.risk).toBe("production-write");
    expect(plan.executionAllowed).toBe(false);
  });

  it("blocks destructive actions by default", () => {
    const plan = buildExecutionPlan("Delete production Supabase records");
    expect(plan.approval).toBe("blocked");
    expect(plan.steps[0]?.risk).toBe("destructive");
    expect(plan.executionAllowed).toBe(false);
  });

  it("blocks ambiguous multi-provider commands", () => {
    const plan = buildExecutionPlan("Configure GitHub and Vercel production secrets");
    expect(plan.command.provider).toBe("multi-provider");
    expect(plan.approval).toBe("blocked");
    expect(plan.steps).toHaveLength(0);
  });

  it("requires approval for staging writes too", () => {
    const plan = buildExecutionPlan("Create a staging Cloudflare R2 bucket");
    expect(plan.command.provider).toBe("cloudflare-r2");
    expect(plan.approval).toBe("required");
    expect(plan.steps[0]?.risk).toBe("staging-write");
  });

  it("blocks unknown actions rather than guessing", () => {
    const plan = buildExecutionPlan("Make it all work automatically");
    expect(plan.approval).toBe("blocked");
    expect(plan.steps).toHaveLength(0);
  });
});
