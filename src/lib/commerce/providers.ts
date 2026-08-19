import type { CommerceCandidate, CustomerIntent, HumanFulfillmentOption } from "@/lib/commerce/recommendation";

/**
 * Provider adapter contract. Adapters return normalized candidates only;
 * ranking remains centralized in the ChatB2K recommendation engine.
 */
export interface CommerceProvider {
  code: string;
  displayName: string;
  enabled: boolean;
  search(intent: CustomerIntent): Promise<CommerceCandidate[]>;
}

export interface ProviderSearchResult {
  provider: string;
  candidates: CommerceCandidate[];
  error?: string;
}

export interface LocalFulfillmentProvider {
  search(intent: CustomerIntent): Promise<CommerceCandidate[]>;
}

const normalizeUrl = (value: string | undefined) => {
  if (!value) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
};

/** Build a safe external-commerce candidate from trusted adapter data. */
export function externalCandidate(input: Omit<CommerceCandidate, "sourceType">): CommerceCandidate {
  return {
    ...input,
    sourceType: "external_commerce",
    url: normalizeUrl(input.url),
  };
}

/** Build a Shop candidate. Shop remains the primary ResoFit source. */
export function shopCandidate(input: Omit<CommerceCandidate, "sourceType">): CommerceCandidate {
  return {
    ...input,
    sourceType: "resofit_shop",
    url: normalizeUrl(input.url),
  };
}

/** Build a verified 48-SKU fallback candidate. */
export function fallback48Candidate(input: Omit<CommerceCandidate, "sourceType">): CommerceCandidate {
  return {
    ...input,
    sourceType: "verified_48_sku",
    url: normalizeUrl(input.url),
  };
}

/** Convert a local human fulfillment record into a ranked candidate. */
export function humanFulfillmentCandidate(
  option: HumanFulfillmentOption,
  intentFit = 80,
): CommerceCandidate {
  return {
    id: option.id,
    title: option.name,
    sourceType: "human_fulfillment",
    sourceName: `${option.name} · ${option.location}`,
    url: normalizeUrl(option.url),
    available: option.available ?? true,
    deliveryDays: option.deliveryDays,
    intentFit,
    qualityScore: 80,
    trustScore: 85,
    locationFit: intent.location?.toLowerCase().includes(option.location.toLowerCase()) ? 100 : 65,
    notes: option.specialties?.join(", "),
  };
}

/**
 * Safe default: external marketplace APIs are opt-in and must be implemented
 * behind server-side adapters. No scraping, credentials, or fabricated live data
 * belongs in the client bundle.
 */
export function createDisabledExternalProvider(code: string, displayName: string): CommerceProvider {
  return {
    code,
    displayName,
    enabled: false,
    async search() {
      return [];
    },
  };
}

export const EXTERNAL_PROVIDER_CODES = ["shopify", "jumia", "konga"] as const;
