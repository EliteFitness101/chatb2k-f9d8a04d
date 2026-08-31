// ChatB2K™ Recommendation Engine — pure, deterministic, client-safe.
// Every assessment produces a reproducible snapshot that is persisted
// alongside the assessment so recommendations can be replayed.
//
// Commerce policy: customer value first. ResoFit Shop is primary,
// but ChatB2K may recommend legitimate external commerce, verified inventory,
// or trusted human fulfillment when those better satisfy intent.
// The Reset funnel is external-only and is never a commerce recommendation.

import { productBySku, type Product } from "@/lib/catalog";

export const ENGINE_VERSION = "v3.1";

export type PrimaryGoal = "cut" | "recomp" | "bulk" | "longevity";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Equipment = "none" | "home_basic" | "home_full" | "gym";
export type Nutrition = "omnivore" | "pescatarian" | "vegetarian" | "halal";
export type TimeAvailability = "lt3" | "three_four" | "five_plus";
export type Budget = "lean" | "committed" | "apex";
export type Mobility = "none" | "knee" | "shoulder" | "back";

export interface AssessmentInput {
  primary_goal: PrimaryGoal;
  experience: Experience;
  equipment: Equipment;
  nutrition: Nutrition;
  time_availability: TimeAvailability;
  budget: Budget;
  mobility: Mobility;
}

export const ASSESSMENT_QUESTIONS: {
  key: keyof AssessmentInput;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  { key: "primary_goal", label: "01 · What is the objective?", options: [
    { value: "cut", label: "Strip fat" }, { value: "recomp", label: "Recomposition" },
    { value: "bulk", label: "Build mass" }, { value: "longevity", label: "Longevity & mobility" },
  ]},
  { key: "experience", label: "02 · Training experience", options: [
    { value: "beginner", label: "Beginner" }, { value: "intermediate", label: "Intermediate" }, { value: "advanced", label: "Advanced" },
  ]},
  { key: "equipment", label: "03 · Available equipment", options: [
    { value: "none", label: "Nothing yet" }, { value: "home_basic", label: "Basic home kit" },
    { value: "home_full", label: "Full home sanctuary" }, { value: "gym", label: "Commercial gym" },
  ]},
  { key: "nutrition", label: "04 · Nutrition preference", options: [
    { value: "omnivore", label: "Omnivore" }, { value: "pescatarian", label: "Pescatarian" },
    { value: "vegetarian", label: "Vegetarian" }, { value: "halal", label: "Halal" },
  ]},
  { key: "time_availability", label: "05 · Weekly time availability", options: [
    { value: "lt3", label: "Under 3 sessions" }, { value: "three_four", label: "3–4 sessions" }, { value: "five_plus", label: "5+ sessions" },
  ]},
  { key: "budget", label: "06 · Investment posture", options: [
    { value: "lean", label: "Lean start" }, { value: "committed", label: "Committed" }, { value: "apex", label: "Apex" },
  ]},
  { key: "mobility", label: "07 · Mobility considerations", options: [
    { value: "none", label: "None" }, { value: "knee", label: "Knee" }, { value: "shoulder", label: "Shoulder" }, { value: "back", label: "Lower back" },
  ]},
];

export interface Recommendation {
  engine_version: string;
  primary_program_sku: string;
  equipment_skus: string[];
  membership_sku: string | null;
  nutrition_sku: string;
  upsell_score: number;
  confidence_score: number;
  rationale: string[];
  ranked_skus: string[];
  subtotal_ngn_minor: number;
}

function scoreProduct(p: Product, a: AssessmentInput): number {
  let s = 0;
  if (p.category === "digital") s += 3;
  if (p.category === "iron") {
    s += a.equipment === "none" ? 4 : a.equipment === "home_basic" ? 3 : 1;
    if (a.primary_goal === "bulk") s += 2;
    if (a.primary_goal === "longevity") s -= 1;
  }
  if (p.category === "bench") {
    s += a.equipment === "home_full" || a.equipment === "home_basic" ? 3 : 1;
    if (a.mobility === "back") s += 1;
  }
  if (p.category === "coaching") {
    s += a.budget === "apex" ? 4 : a.budget === "committed" ? 2 : 0;
    if (a.experience === "beginner") s += 1;
  }
  if (p.category === "bundle") s += a.budget === "apex" ? 5 : 0;
  if (a.budget === "lean" && p.ngnMinor > 5_000_000) s -= 3;
  if (a.budget === "committed" && p.ngnMinor > 30_000_000) s -= 2;
  if (a.time_availability === "lt3" && p.category === "coaching") s -= 1;
  return s;
}

const PROGRAM_BY_GOAL: Record<PrimaryGoal, string> = {
  cut: "RES-DIG-90D", recomp: "RES-DIG-90D", bulk: "RES-DIG-90D", longevity: "RES-DIG-NUT",
};

const EQUIPMENT_LADDER: Record<Equipment, string[]> = {
  none: ["RES-IRON-15"], home_basic: ["RES-IRON-30", "RES-BENCH-01"], home_full: ["RES-IRON-50", "RES-BENCH-01"], gym: [],
};

export function recommend(a: AssessmentInput): Recommendation {
  const rationale: string[] = [];
  const primary_program_sku = PROGRAM_BY_GOAL[a.primary_goal];
  rationale.push(`Programme selected for a ${a.primary_goal} objective.`);
  let equipment_skus = [...EQUIPMENT_LADDER[a.equipment]];
  if (a.budget === "lean") equipment_skus = equipment_skus.slice(0, 1);
  if (a.budget === "apex") equipment_skus = ["RES-BUNDLE-APEX"];
  if (equipment_skus.length === 0) rationale.push("Commercial gym access detected — no equipment required.");
  else rationale.push(`Equipment matched to your ${a.equipment.replace("_", " ")} setup.`);
  const membership_sku = a.budget === "apex" || (a.budget === "committed" && a.experience === "beginner") ? "RES-COACH-01" : null;
  if (membership_sku) rationale.push("1-on-1 coaching added for accountability.");
  const nutrition_sku = "RES-DIG-NUT";
  rationale.push(`Nutrition protocol adapted to a ${a.nutrition} preference.`);
  if (a.mobility !== "none") rationale.push(`Programming will regress loading around your ${a.mobility} history.`);
  const upsell_score = Math.min(1, (a.budget === "apex" ? 0.5 : a.budget === "committed" ? 0.3 : 0.1) + (a.time_availability === "five_plus" ? 0.25 : 0.1) + (a.experience === "advanced" ? 0.2 : 0.05));
  const answered = Object.values(a).filter(Boolean).length;
  const confidence_score = Math.min(1, answered / 7 - (a.mobility !== "none" ? 0.08 : 0) - (a.equipment === "none" ? 0.05 : 0));
  const selected = [primary_program_sku, ...equipment_skus, nutrition_sku].concat(membership_sku ? [membership_sku] : []).filter((v, i, arr) => arr.indexOf(v) === i);
  const ranked_skus = selected.map((sku) => productBySku(sku)).filter((p): p is Product => Boolean(p)).sort((x, y) => scoreProduct(y, a) - scoreProduct(x, a)).map((p) => p.sku);
  const subtotal_ngn_minor = ranked_skus.reduce((sum, sku) => sum + (productBySku(sku)?.ngnMinor ?? 0), 0);
  return { engine_version: ENGINE_VERSION, primary_program_sku, equipment_skus, membership_sku, nutrition_sku, upsell_score: Number(upsell_score.toFixed(2)), confidence_score: Number(Math.max(0, confidence_score).toFixed(2)), rationale, ranked_skus, subtotal_ngn_minor };
}

export type RecommendationSourceType = "resofit_shop" | "external_commerce" | "verified_48_sku" | "human_fulfillment";

export interface CustomerIntent {
  goal: string;
  budgetMinor?: number;
  location?: string;
  urgency?: "now" | "today" | "this_week" | "flexible";
  keywords?: string[];
}

export interface CommerceCandidate {
  id: string;
  title: string;
  sourceType: RecommendationSourceType;
  sourceName: string;
  url?: string;
  priceMinor?: number;
  currency?: string;
  available?: boolean;
  deliveryDays?: number;
  deliveryCostMinor?: number;
  intentFit?: number;
  qualityScore?: number;
  trustScore?: number;
  locationFit?: number;
  notes?: string;
}

export interface RankedRecommendation extends CommerceCandidate {
  score: number;
  reason: string;
  fallbackLevel: number;
}

export interface HumanFulfillmentOption {
  id: string;
  name: string;
  location: string;
  phone?: string;
  available?: boolean;
  deliveryDays?: number;
  specialties?: string[];
  url?: string;
}

const SOURCE_WEIGHT: Record<RecommendationSourceType, number> = {
  resofit_shop: 4,
  external_commerce: 3,
  verified_48_sku: 2,
  human_fulfillment: 2,
};

function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }

function budgetFit(candidate: CommerceCandidate, intent: CustomerIntent) {
  if (!intent.budgetMinor || !candidate.priceMinor) return 70;
  if (candidate.priceMinor <= intent.budgetMinor) return clamp(85 + ((intent.budgetMinor - candidate.priceMinor) / intent.budgetMinor) * 15);
  return clamp(80 - ((candidate.priceMinor - intent.budgetMinor) / intent.budgetMinor) * 120);
}

function deliveryFit(candidate: CommerceCandidate, intent: CustomerIntent) {
  if (!candidate.available) return 0;
  if (candidate.deliveryDays == null) return 65;
  if (intent.urgency === "now") return candidate.deliveryDays <= 1 ? 100 : 35;
  if (intent.urgency === "today") return candidate.deliveryDays === 0 ? 100 : candidate.deliveryDays <= 1 ? 85 : 30;
  if (intent.urgency === "this_week") return candidate.deliveryDays <= 7 ? 90 : 35;
  return 75;
}

/** Customer-value ranking. Source ownership is only a small tie-breaker. */
export function rankCommerceCandidates(intent: CustomerIntent, candidates: CommerceCandidate[]): RankedRecommendation[] {
  return candidates.map((candidate) => {
    const score = (candidate.intentFit ?? 50) * 0.35 + budgetFit(candidate, intent) * 0.2 + deliveryFit(candidate, intent) * 0.15 + (candidate.qualityScore ?? 60) * 0.1 + (candidate.trustScore ?? 60) * 0.1 + (candidate.locationFit ?? 60) * 0.1 + SOURCE_WEIGHT[candidate.sourceType] * 0.5;
    const reasonParts = [
      candidate.intentFit != null ? `intent fit ${Math.round(candidate.intentFit)}/100` : undefined,
      candidate.priceMinor != null ? "budget evaluated" : undefined,
      candidate.deliveryDays != null ? `${candidate.deliveryDays}d delivery signal` : undefined,
      candidate.sourceType === "resofit_shop" ? "ResoFit Shop primary source" : undefined,
    ].filter(Boolean);
    return {
      ...candidate,
      score: Math.round(clamp(score)),
      reason: reasonParts.join(" · ") || "best available value match",
      fallbackLevel: candidate.sourceType === "resofit_shop" ? 1 : candidate.sourceType === "external_commerce" ? 2 : candidate.sourceType === "verified_48_sku" ? 3 : 4,
    };
  }).filter((candidate) => candidate.available !== false).sort((a, b) => b.score - a.score);
}

export function resolveBestRecommendation(intent: CustomerIntent, candidates: CommerceCandidate[]): RankedRecommendation {
  const best = rankCommerceCandidates(intent, candidates)[0];
  if (!best) throw new Error("No eligible commerce recommendation is available for this intent.");
  return best;
}

export const CHATB2K_COMMERCE_POLICY = {
  primary: "shop.resofit.fit",
  fallbackCatalog: "verified_inventory",
  externalCommerceAllowed: true,
  humanFulfillmentAllowed: true,
  ownershipMustNotOverrideCustomerValue: true,
  externalResetHandling: "reset.resofit.fit",
  supportedExternalSourceExamples: ["shopify", "jumia", "konga"],
  localFulfillmentNetwork: ["Aba", "Onitsha", "Lagos"],
} as const;
