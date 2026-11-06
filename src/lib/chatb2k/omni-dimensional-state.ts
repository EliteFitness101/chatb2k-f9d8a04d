/**
 * ChatB2K Omni-Dimensional State — pure decision-gate contract.
 *
 * This module is intentionally side-effect free. It does not read/write Supabase,
 * invoke agents, or bypass the production orchestrator/control plane.
 */

export const OMNI_DIMENSIONS = [
  "evidence",
  "confidence",
  "risk",
  "authority",
  "objective",
  "resources",
  "constraints",
  "dependencies",
  "ethics",
  "governance",
  "readiness",
  "learning",
] as const;

export type OmniDimension = (typeof OMNI_DIMENSIONS)[number];
export type DimensionStatus = "known" | "unknown" | "stale" | "blocked";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface DimensionValue<T = unknown> {
  status: DimensionStatus;
  value: T | null;
  source: string | null;
  observedAt: string | null;
  note?: string;
}

export interface OmniDimensionalState {
  stateId: string;
  evaluatedAt: string;
  dimensions: {
    evidence: DimensionValue<{ references: string[]; verified: boolean }>;
    confidence: DimensionValue<number>;
    risk: DimensionValue<RiskLevel>;
    authority: DimensionValue<{ permitted: boolean; actor?: string }>;
    objective: DimensionValue<{ id: string; description: string }>;
    resources: DimensionValue<{ available: string[]; missing: string[] }>;
    constraints: DimensionValue<{ satisfied: boolean; violations: string[] }>;
    dependencies: DimensionValue<{ ready: boolean; missing: string[] }>;
    ethics: DimensionValue<{ cleared: boolean; concerns: string[] }>;
    governance: DimensionValue<{ approved: boolean; killSwitchActive: boolean }>;
    readiness: DimensionValue<"ready" | "not_ready">;
    learning: DimensionValue<{ priorOutcomeIds: string[]; incorporated: boolean }>;
  };
}

export interface GatePolicy {
  minimumConfidence: number;
  maxEvidenceAgeMs: number;
}

export interface GateDecision {
  allowed: boolean;
  blockers: string[];
  evaluatedAt: string;
  stateId: string;
}

export const DEFAULT_GATE_POLICY: Readonly<GatePolicy> = Object.freeze({
  minimumConfidence: 0.75,
  maxEvidenceAgeMs: 15 * 60 * 1000,
});

function ageIsValid(
  observedAt: string | null,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  if (!observedAt) return false;
  const timestamp = Date.parse(observedAt);
  return Number.isFinite(timestamp) && timestamp <= nowMs && nowMs - timestamp <= maxAgeMs;
}

/**
 * Fail-closed gate for consequential actions. Unknown or stale critical state
 * is a blocker; callers must not treat a blocked decision as authorization.
 */
export function evaluateOmniState(
  state: OmniDimensionalState,
  now: Date = new Date(),
  policy: GatePolicy = DEFAULT_GATE_POLICY,
): GateDecision {
  const blockers: string[] = [];
  const d = state.dimensions;
  const nowMs = now.getTime();

  for (const key of OMNI_DIMENSIONS) {
    const value = d[key];
    if (value.status !== "known") blockers.push(`${key}_${value.status}`);
  }

  if (!d.evidence.value?.verified) blockers.push("evidence_not_verified");
  if (!d.evidence.value?.references.length) blockers.push("evidence_references_missing");
  if (!ageIsValid(d.evidence.observedAt, nowMs, policy.maxEvidenceAgeMs)) {
    blockers.push("evidence_stale_or_timestamp_invalid");
  }

  const confidence = d.confidence.value;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) ||
      confidence < policy.minimumConfidence || confidence > 1) {
    blockers.push("confidence_below_threshold_or_invalid");
  }

  if (!d.risk.value) blockers.push("risk_missing");
  else if (d.risk.value === "high" || d.risk.value === "critical") blockers.push("risk_requires_review");

  if (d.authority.value?.permitted !== true) blockers.push("authority_not_granted");
  if (!d.objective.value?.id || !d.objective.value.description.trim()) blockers.push("objective_missing");
  if (!d.resources.value || d.resources.value.missing.length) blockers.push("resources_unavailable");
  if (d.constraints.value?.satisfied !== true || (d.constraints.value?.violations.length ?? 0) > 0) {
    blockers.push("constraints_not_satisfied");
  }
  if (d.dependencies.value?.ready !== true || (d.dependencies.value?.missing.length ?? 0) > 0) {
    blockers.push("dependencies_not_ready");
  }
  if (d.ethics.value?.cleared !== true || (d.ethics.value?.concerns.length ?? 0) > 0) {
    blockers.push("ethics_not_cleared");
  }
  if (d.governance.value?.approved !== true) blockers.push("governance_not_approved");
  if (d.governance.value?.killSwitchActive === true) blockers.push("global_kill_switch_active");
  if (d.readiness.value !== "ready") blockers.push("readiness_not_ready");
  if (d.learning.value?.incorporated !== true) blockers.push("learning_not_incorporated");

  return {
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    evaluatedAt: now.toISOString(),
    stateId: state.stateId,
  };
}
