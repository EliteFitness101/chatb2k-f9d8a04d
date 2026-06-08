// Revenue Brain v2 — pure utilities (ROI ranking, forecasting, reliability)

export interface BrainAction {
  type: string;
  label?: string;
  impact_weight?: number;
  data?: { confidence?: number };
}

export interface RankedAction extends BrainAction {
  predicted_roi: number;
  priority_score: number;
  priority_rank: number;
  revenue_impact: number;
  confidence: number;
}

const BASE_LIFT: Record<string, number> = {
  OPTIMIZE_CHECKOUT: 0.18,
  WHATSAPP_RECOVERY: 0.32,
  CTA_OPTIMIZATION: 0.12,
};

export function calculateROI(
  actions: BrainAction[],
  baseRevenueMinor = 0,
): RankedAction[] {
  const scored = actions.map((action) => {
    const baseLift = BASE_LIFT[action.type] ?? 0.05;
    const confidence = action.data?.confidence ?? 0.6;
    const weight = action.impact_weight ?? 1;
    const predicted_roi = baseLift * confidence;
    return {
      ...action,
      predicted_roi,
      priority_score: predicted_roi * weight,
      confidence,
      revenue_impact: Math.round(baseRevenueMinor * predicted_roi),
      priority_rank: 0,
    };
  });
  scored.sort((a, b) => b.priority_score - a.priority_score);
  scored.forEach((a, i) => (a.priority_rank = i + 1));
  return scored;
}

export function forecastRevenue(eventsTodayMinor: number) {
  const trendMultiplier = 1.12;
  return {
    today_minor: eventsTodayMinor,
    projected_7d_minor: Math.round(eventsTodayMinor * trendMultiplier * 7),
    projected_30d_minor: Math.round(eventsTodayMinor * trendMultiplier * 30),
  };
}

export interface ReliabilityInput {
  reference: string | null;
  rsid: string | null;
  source: string | null;
  seenRefs: Set<string>;
}

export function reliabilityScore(e: ReliabilityInput): number {
  let score = 100;
  if (!e.rsid) score -= 40; // orphan
  if (!e.source) score -= 10;
  if (e.reference && e.seenRefs.has(e.reference)) score -= 50; // duplicate risk
  return Math.max(0, score);
}