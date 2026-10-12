# ChatB2K Supabase connection readiness

**Canonical mapping (12 October 2026)**

- ChatB2K orchestration repository: `EliteFitness101/chatb2k-f9d8a04d`
- Intended Supabase target: `ResoFlex-Edge-Node` — `xtgteviwtoupbfvorrmk` (eu-central-1)
- Commerce, payment, catalog, entitlements, and paid digital-delivery source of truth: `shopb2k` → `resonance-fitness` — `vbqjvmnhdtdhmeeudqnn` (eu-west-1)
- Legacy retirement candidate: `EliteFitness101/chatb2k`; do not archive the active repository.

## Safety gate before enabling production deployment

The active ChatB2K repository currently has 38 migration files, while the target Edge Node has no recorded migrations and only the two deployed functions `xbang-runtime-health` and `xbang-live-pipeline`. The repository currently has six function directories. This is migration/function drift, not a production-ready GitHub deployment mapping.

Until migration dependencies and function configuration have been reconciled:

1. Connect the repository through Supabase Dashboard → Project Settings → Integrations → GitHub Integration.
2. Select this repository and set Working directory to `.` because `supabase/` is at the repository root.
3. Keep **Deploy to production** disabled.
4. Keep automatic branching disabled until branch/migration behavior is reviewed.
5. Do not run `supabase db push`, bulk migration replay, or deploy all repository functions to the Edge Node.
6. Reconcile the 38 migration files against the Edge Node schema, then declare and review each function's JWT setting and required secrets before enabling any deployment.

The `project_id` in `supabase/config.toml` is the intended CLI target; it does **not** by itself authorize or complete the Dashboard GitHub integration. Dashboard authorization and repository selection remain separate steps.
