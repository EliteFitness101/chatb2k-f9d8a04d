import { createFileRoute } from "@tanstack/react-router";

const countryCurrency: Record<string, string> = {
  NG: "NGN", US: "USD", GB: "GBP", IE: "EUR", DE: "EUR", FR: "EUR",
  ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", PT: "EUR",
  FI: "EUR", GR: "EUR", LU: "EUR", CY: "EUR", MT: "EUR", SK: "EUR",
  SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", HR: "EUR",
  CA: "CAD", AU: "AUD", NZ: "NZD", GH: "GHS", ZA: "ZAR", KE: "KES",
  UG: "UGX", TZ: "TZS", RW: "RWF", EG: "EGP", MA: "MAD", IN: "INR",
  SG: "SGD", MY: "MYR", PH: "PHP", ID: "IDR", JP: "JPY", KR: "KRW",
  BR: "BRL", MX: "MXN", CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK",
  PL: "PLN", CZ: "CZK", HU: "HUF", TR: "TRY", AE: "AED", SA: "SAR",
};

const allowedOrigin = "https://elite.resofit.fit";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept",
  "Cache-Control": "private, no-store",
  "Vary": "Origin",
};

export const Route = createFileRoute("/api/public/visitor-locale")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== allowedOrigin) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: corsHeaders });
      },
      GET: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== allowedOrigin) {
          return Response.json({ country: null, currency: null }, { status: 403, headers: { "Cache-Control": "no-store" } });
        }
        // Read only the country code added by the hosting edge; never expose the visitor IP.
        const raw = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? "";
        const country = /^[A-Z]{2}$/.test(raw.toUpperCase()) && raw.toUpperCase() !== "XX" ? raw.toUpperCase() : null;
        return Response.json(
          { country, currency: country ? countryCurrency[country] ?? null : null, source: country ? "edge-country-hint" : "unavailable" },
          { status: 200, headers: corsHeaders },
        );
      },
    },
  },
});
