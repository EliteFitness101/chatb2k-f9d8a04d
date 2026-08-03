// Client-safe region/currency configuration contract shared by the geo
// resolver, checkout, and the admin command center.

export type CurrencyCode = "NGN" | "USD" | "GBP" | "EUR" | "CAD";
export type ProviderCode =
  | "paystack"
  | "shopify"
  | "flutterwave"
  | "palmpay"
  | "crypto"
  | "selar";

export interface CommerceRoute {
  countryCode: string;
  region: string;
  currency: CurrencyCode;
  provider: ProviderCode;
  hubTier: string;
  cryptoThresholdMinor: number; // in NGN kobo (base currency)
}

/** Base currency of the pricing engine. All thresholds are evaluated here. */
export const BASE_CURRENCY: CurrencyCode = "NGN";

/** Approximate FX vs the base currency (1 unit of currency = N base units). */
export const FX_TO_BASE: Record<CurrencyCode, number> = {
  NGN: 1,
  USD: 1600,
  CAD: 1180,
  GBP: 2030,
  EUR: 1740,
};

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  NGN: "₦",
  USD: "$",
  CAD: "CA$",
  GBP: "£",
  EUR: "€",
};

/** Static fallback used before the config table responds (or if it fails). */
export const FALLBACK_ROUTE: CommerceRoute = {
  countryCode: "NG",
  region: "africa",
  currency: "NGN",
  provider: "paystack",
  hubTier: "global_hq",
  cryptoThresholdMinor: 38_000_000,
};

/** Convert a minor-unit amount in `currency` into base-currency minor units. */
export function toBaseMinor(amountMinor: number, currency: CurrencyCode): number {
  return Math.round(amountMinor * (FX_TO_BASE[currency] ?? 1));
}

/**
 * Crypto rule: offered when the subtotal, expressed in the pricing engine's
 * base currency, meets or exceeds the configured threshold.
 */
export function cryptoEligible(
  subtotalMinor: number,
  currency: CurrencyCode,
  thresholdMinor: number,
): boolean {
  return toBaseMinor(subtotalMinor, currency) >= thresholdMinor;
}

export function formatMinor(amountMinor: number, currency: CurrencyCode): string {
  try {
    return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "NGN" ? 0 : 2,
    }).format(amountMinor / 100);
  } catch {
    return `${CURRENCY_SYMBOL[currency] ?? ""}${(amountMinor / 100).toLocaleString()}`;
  }
}