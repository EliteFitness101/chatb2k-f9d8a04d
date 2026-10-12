# ChatB2K Omni-Dimensional State

## Purpose

Provide one explicit, typed state contract for the twelve documented dimensions:

1. Evidence
2. Confidence
3. Risk
4. Authority
5. Objective
6. Resources
7. Constraints
8. Dependencies
9. Ethics
10. Governance
11. Readiness
12. Learning

The evaluation lifecycle remains:

`EVENT → EVIDENCE → INTELLIGENCE → DISCERNMENT → STATE → GOVERNANCE → ACTION → OUTCOME → LEARNING → next state evaluation`

## Implementation in this patch

- `src/lib/chatb2k/omni-dimensional-state.ts` defines the typed state and a pure, fail-closed action gate.
- `src/lib/chatb2k/omni-dimensional-state.test.ts` covers positive readiness, denied authority, stale evidence, kill switch, high risk/low confidence and unknown dependencies.
- No database schema, production function, route, agent registry, router or dashboard is changed.
- The evaluator is a contract and safety primitive, **not yet wired into production orchestration**. It must be integrated into the canonical source for deployed `chatb2k-orchestrator` v26 after that source is reconciled into version control.

## Safety behavior

An action is blocked when a dimension is unknown/stale/blocked, evidence is unverified or stale, confidence is below threshold, risk is high/critical, authority is absent, constraints or dependencies fail, ethics/governance are not cleared, the kill switch is active, readiness is not ready, or learning has not been incorporated. This gate is not a substitute for existing router authorization or the Supabase control plane; both remain authoritative.

## Defaults

- Minimum confidence: 0.75
- Maximum evidence age: 15 minutes
- Timestamp: ISO-8601
- Unknown state: explicit; never coerced to a safe default

These are conservative application defaults and should be calibrated against production event freshness and action classes during integration. Higher-risk actions should have stricter policy, not weaker policy.
