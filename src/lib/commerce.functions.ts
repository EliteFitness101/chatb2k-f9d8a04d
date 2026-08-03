import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import {
  FALLBACK_ROUTE,
  type CommerceRoute,
  type CurrencyCode,
  type ProviderCode,
} from "@/lib/commerce/regions";

export interface CommerceContext extends CommerceRoute {
  hubId: string | null;
  hubName: string | null;
  providers: {
    code: string;
    display_name: string;
    enabled: boolean;
    live: boolean;
  }[];
}

/**
 * Central resolver: Visitor → Geo → Country → Currency → Provider → Hub.
 * Configuration-driven: every mapping is read from `currency_routes`,
 * `payment_providers` and `hubs`. Nothing is hardcoded except the fallback.
 */
export const resolveCommerceContext = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommerceContext> => {
    const country = (
      getRequestHeader("cf-ipcountry") ||
      getRequestHeader("x-vercel-ip-country") ||
      getRequestHeader("x-country") ||
      "NG"
    ).toUpperCase();

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const url = process.env["SUPABASE_URL"]!;
    const supabase = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const [routeRes, defaultRes, providerRes] = await Promise.all([
      supabase.from("currency_routes").select("*").eq("country_code", country).maybeSingle(),
      supabase.from("currency_routes").select("*").eq("is_default", true).maybeSingle(),
      supabase
        .from("payment_providers")
        .select("code, display_name, enabled, live")
        .order("sort_order"),
    ]);

    const row = routeRes.data ?? defaultRes.data;
    const route: CommerceRoute = row
      ? {
          countryCode: country,
          region: row.region ?? FALLBACK_ROUTE.region,
          currency: (row.currency as CurrencyCode) ?? FALLBACK_ROUTE.currency,
          provider: ((row.provider ?? row.rail) as ProviderCode) ?? FALLBACK_ROUTE.provider,
          hubTier: row.hub_tier ?? FALLBACK_ROUTE.hubTier,
          cryptoThresholdMinor: Number(row.crypto_threshold_minor ?? 38_000_000),
        }
      : { ...FALLBACK_ROUTE, countryCode: country };

    let hubQuery = supabase.from("hubs").select("id, name").eq("tier", route.hubTier);
    if (route.hubTier === "international") hubQuery = hubQuery.eq("country_code", country);
    const { data: hub } = await hubQuery.limit(1).maybeSingle();
    const fallbackHub = hub
      ? null
      : (await supabase.from("hubs").select("id, name").eq("tier", "global_hq").limit(1).maybeSingle())
          .data;
    const chosen = hub ?? fallbackHub;

    return {
      ...route,
      hubId: chosen?.id ?? null,
      hubName: chosen?.name ?? null,
      providers: providerRes.data ?? [],
    };
  },
);