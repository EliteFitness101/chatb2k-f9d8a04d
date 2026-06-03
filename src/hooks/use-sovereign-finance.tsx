import { useEffect, useState } from "react";
import { getGeo } from "@/lib/geo.functions";

export type CurrencyCode = "NGN" | "USD" | "GBP" | "EUR";

const SYMBOLS: Record<CurrencyCode, string> = {
  NGN: "₦", USD: "$", GBP: "£", EUR: "€",
};

// Approximate FX (relative to USD). Replace with live rate API later.
const RATES_VS_USD: Record<CurrencyCode, number> = {
  USD: 1, NGN: 1600, GBP: 0.79, EUR: 0.92,
};

export interface SovereignFinance {
  currency: CurrencyCode;
  symbol: string;
  country: string;
  rail: "paystack" | "shopify";
  hub: string;
  ready: boolean;
  /** Convert an NGN minor-unit price (kobo) to display string in active currency. */
  formatFromNGN: (ngnMinor: number) => string;
}

const DEFAULT: SovereignFinance = {
  currency: "NGN", symbol: "₦", country: "NG", rail: "paystack",
  hub: "Global HQ", ready: false,
  formatFromNGN: (m) => `₦${(m / 100).toLocaleString()}`,
};

export function useSovereignFinance(): SovereignFinance {
  const [state, setState] = useState<SovereignFinance>(DEFAULT);
  useEffect(() => {
    getGeo()
      .then((g) => {
        const currency = g.currency as CurrencyCode;
        setState({
          currency,
          symbol: SYMBOLS[currency] ?? "$",
          country: g.country,
          rail: g.rail,
          hub: g.suggestedHub,
          ready: true,
          formatFromNGN: (ngnMinor) => {
            const usd = ngnMinor / 100 / RATES_VS_USD.NGN;
            const local = usd * (RATES_VS_USD[currency] ?? 1);
            return `${SYMBOLS[currency] ?? "$"}${local.toLocaleString(undefined, {
              maximumFractionDigits: currency === "NGN" ? 0 : 2,
            })}`;
          },
        });
      })
      .catch(() => setState({ ...DEFAULT, ready: true }));
  }, []);
  return state;
}