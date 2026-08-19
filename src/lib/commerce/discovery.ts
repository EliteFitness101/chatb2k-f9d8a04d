import {
  createReset1000Fallback,
  rankCommerceCandidates,
  type CommerceCandidate,
  type CustomerIntent,
  type HumanFulfillmentOption,
  type RankedRecommendation,
} from "@/lib/commerce/recommendation";

export interface CommerceDiscoverySources {
  shop?: CommerceCandidate[];
  external?: CommerceCandidate[];
  fallback48Sku?: CommerceCandidate[];
  human?: HumanFulfillmentOption[];
}

export interface CommerceDiscoveryResult {
  recommendations: RankedRecommendation[];
  best: RankedRecommendation;
  sourceCount: number;
  sourceTypes: string[];
  usedResetFallback: boolean;
}

function humanToCandidate(option: HumanFulfillmentOption, intent: CustomerIntent): CommerceCandidate {
  const locationFit = intent.location && option.location
    ? option.location.toLowerCase().includes(intent.location.toLowerCase()) ? 100 : 60
    : 70;

  return {
    id: option.id,
    title: option.name,
    sourceType: "human_fulfillment",
    sourceName: option.name,
    url: option.url,
    available: option.available ?? true,
    deliveryDays: option.deliveryDays,
    locationFit,
    intentFit: 80,
    qualityScore: 80,
    trustScore: 90,
    notes: option.specialties?.join(", "),
  };
}

/**
 * Merge all eligible commerce sources without allowing ResoFit ownership to
 * override customer value. The caller supplies normalized candidates from
 * Shop, external commerce connectors, the verified 48-SKU fallback, and the
 * human fulfillment network.
 */
export function discoverCommerceSolutions(
  intent: CustomerIntent,
  sources: CommerceDiscoverySources,
  resetUrl?: string,
): CommerceDiscoveryResult {
  const candidates = [
    ...(sources.shop ?? []),
    ...(sources.external ?? []),
    ...(sources.fallback48Sku ?? []),
    ...(sources.human ?? []).map((option) => humanToCandidate(option, intent)),
  ];

  const recommendations = rankCommerceCandidates(intent, candidates);
  const best = recommendations[0] ?? createReset1000Fallback(resetUrl);

  return {
    recommendations,
    best,
    sourceCount: candidates.length,
    sourceTypes: [...new Set(candidates.map((candidate) => candidate.sourceType))],
    usedResetFallback: recommendations.length === 0,
  };
}

export function selectTopSolutions(
  intent: CustomerIntent,
  sources: CommerceDiscoverySources,
  limit = 3,
  resetUrl?: string,
): RankedRecommendation[] {
  const result = discoverCommerceSolutions(intent, sources, resetUrl);
  return result.recommendations.slice(0, Math.max(1, limit));
}
