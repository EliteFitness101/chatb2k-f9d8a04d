import { describe, expect, it } from "vitest";
import { evaluateOmniState, type OmniDimensionalState } from "./omni-dimensional-state";

const now = new Date("2026-10-12T12:00:00.000Z");

function readyState(): OmniDimensionalState {
  const known = <T,>(value: T) => ({
    status: "known" as const,
    value,
    source: "test-fixture",
    observedAt: "2026-10-12T11:55:00.000Z",
  });
  return {
    stateId: "state-test-001",
    evaluatedAt: now.toISOString(),
    dimensions: {
      evidence: known({ references: ["source:verified-1"], verified: true }),
      confidence: known(0.92),
      risk: known("low"),
      authority: known({ permitted: true, actor: "authorized-service" }),
      objective: known({ id: "objective-1", description: "Complete approved task" }),
      resources: known({ available: ["catalog"], missing: [] }),
      constraints: known({ satisfied: true, violations: [] }),
      dependencies: known({ ready: true, missing: [] }),
      ethics: known({ cleared: true, concerns: [] }),
      governance: known({ approved: true, killSwitchActive: false }),
      readiness: known("ready"),
      learning: known({ priorOutcomeIds: [], incorporated: true }),
    },
  };
}

describe("evaluateOmniState", () => {
  it("allows a complete, fresh, low-risk, authorized state", () => {
    expect(evaluateOmniState(readyState(), now).allowed).toBe(true);
    expect(evaluateOmniState(readyState(), now).blockers).toEqual([]);
  });

  it("fails closed when authority is denied", () => {
    const state = readyState();
    state.dimensions.authority.value = { permitted: false };
    const result = evaluateOmniState(state, now);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("authority_not_granted");
  });

  it("fails closed when evidence is stale", () => {
    const state = readyState();
    state.dimensions.evidence.observedAt = "2026-10-12T10:00:00.000Z";
    expect(evaluateOmniState(state, now).blockers).toContain("evidence_stale_or_timestamp_invalid");
  });

  it("blocks on a global kill switch", () => {
    const state = readyState();
    state.dimensions.governance.value = { approved: true, killSwitchActive: true };
    expect(evaluateOmniState(state, now).blockers).toContain("global_kill_switch_active");
  });

  it("blocks high or critical risk and low confidence", () => {
    const state = readyState();
    state.dimensions.risk.value = "high";
    state.dimensions.confidence.value = 0.4;
    const result = evaluateOmniState(state, now);
    expect(result.blockers).toContain("risk_requires_review");
    expect(result.blockers).toContain("confidence_below_threshold_or_invalid");
  });

  it("blocks unknown dimensions rather than interpreting unknown as safe", () => {
    const state = readyState();
    state.dimensions.dependencies.status = "unknown";
    expect(evaluateOmniState(state, now).blockers).toContain("dependencies_unknown");
  });
});
