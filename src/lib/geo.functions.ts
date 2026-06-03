import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

// Returns visitor country + suggested currency + suggested rail.
// Uses Cloudflare's CF-IPCountry header when present, falls back to NG default.
export const getGeo = createServerFn({ method: "GET" }).handler(async () => {
  const country =
    getRequestHeader("cf-ipcountry") ||
    getRequestHeader("x-vercel-ip-country") ||
    getRequestHeader("x-country") ||
    "NG";

  const ip = getRequestIP({ xForwardedFor: true }) ?? null;

  const isNigeria = country.toUpperCase() === "NG";
  const isUS = country.toUpperCase() === "US";
  const isUK = country.toUpperCase() === "GB";
  const isEU = ["FR", "DE", "IT", "ES", "NL", "BE", "IE", "PT", "AT"].includes(
    country.toUpperCase(),
  );

  let currency: "NGN" | "USD" | "GBP" | "EUR" = "USD";
  if (isNigeria) currency = "NGN";
  else if (isUK) currency = "GBP";
  else if (isEU) currency = "EUR";

  const rail: "paystack" | "shopify" = isNigeria ? "paystack" : "shopify";

  // Hub assignment heuristic
  let suggestedHub: string;
  if (isNigeria) suggestedHub = "Global HQ — Melrose Plaza";
  else if (isUS) suggestedHub = "108 CraneFord, Jersey City";
  else suggestedHub = "Elite Experience Hub, Ottawa";

  return {
    country: country.toUpperCase(),
    ip,
    currency,
    rail,
    suggestedHub,
  };
});