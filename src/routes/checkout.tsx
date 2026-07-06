import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { products, productBySku, formatNGN, formatUSD } from "@/lib/catalog";
import { getGeo } from "@/lib/geo.functions";
import { pageMeta, breadcrumbScript, canonicalLink, SITE_URL } from "@/lib/site-meta";
import { getAttribution } from "@/lib/attribution";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let s = sessionStorage.getItem("rf_session");
    if (!s) {
      s =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem("rf_session", s);
    }
    return s;
  } catch {
    return "";
  }
}

function trackCommerce(event: string, props: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  try {
    const { rsid, utm } = getAttribution();
    const session_id = getSessionId();
    const payload = {
      event,
      rsid,
      session_id,
      funnel_origin: "resofit",
      utm,
      timestamp: new Date().toISOString(),
      ...props,
    };
    (window as unknown as { dataLayer?: unknown[] }).dataLayer?.push(payload);
    void fetch("/api/public/funnel-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_name: event, rsid, props: payload }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export const Route = createFileRoute("/checkout")({
  validateSearch: (s) => z.object({ sku: z.string().optional() }).parse(s),
  head: () => ({
    meta: pageMeta({
      title: "Smart Checkout",
      description: "The Financial Router — pay via the rail nearest to you.",
      url: SITE_URL + "/checkout",
      type: "website",
    }),
    links: [canonicalLink(SITE_URL + "/checkout")],
    scripts: [
      breadcrumbScript([
        { name: "Home", url: SITE_URL + "/" },
        { name: "Checkout", url: SITE_URL + "/checkout" },
      ]),
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { sku } = Route.useSearch();
  const product = (sku && productBySku(sku)) || products[0];
  const [geo, setGeo] = useState<{ country: string; currency: string; rail: string; suggestedHub: string } | null>(null);

  useEffect(() => {
    getGeo().then(setGeo).catch(() => null);
  }, []);

  // Fire checkout_started exactly once per SKU per session
  useEffect(() => {
    if (typeof window === "undefined" || !product) return;
    try {
      const key = `rf_checkout_started_${product.sku}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      trackCommerce("checkout_started", {
        product_sku: product.sku,
        product_slug: product.slug,
        quantity: 1,
        value: product.ngnMinor / 100,
        currency: "NGN",
      });
    } catch {}
  }, [product]);

  const isNG = geo?.currency === "NGN";
  const price = isNG ? formatNGN(product.ngnMinor) : formatUSD(product.usdMinor);

  return (
    <SiteShell>
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Financial Router"
          title="Smart checkout."
          sub="The system auto-routes you to the right rail. Manual override below."
        />

        <div className="mt-10 glass rounded-md p-8">
          <div className="flex items-center justify-between border-b border-[var(--glass-border)] pb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-gold">Selected</div>
              <div className="font-display text-xl mt-1">{product.title}</div>
            </div>
            <div className="font-display text-2xl text-gold-gradient">{price}</div>
          </div>

          {geo && (
            <div className="mt-4 text-xs text-muted-foreground tracking-widest uppercase">
              Detected · {geo.country} · {geo.currency} · {geo.suggestedHub}
            </div>
          )}

          <div className="mt-8 grid sm:grid-cols-2 gap-3">
            <RailButton
              to="/paystack"
              search={{ sku: product.sku }}
              label="Paystack"
              note="Nigeria · Naira · Inline"
              recommended={isNG}
              onSelect={() =>
                trackCommerce("add_to_cart", {
                  product_sku: product.sku,
                  product_slug: product.slug,
                  quantity: 1,
                  value: product.ngnMinor / 100,
                  currency: "NGN",
                  variant: "paystack",
                })
              }
            />
            <RailButton
              to="/shopify"
              label="Shopify"
              note="USD / GBP / EUR"
              recommended={!isNG && !!geo}
              onSelect={() =>
                trackCommerce("add_to_cart", {
                  product_sku: product.sku,
                  product_slug: product.slug,
                  quantity: 1,
                  value: product.usdMinor / 100,
                  currency: "USD",
                  variant: "shopify",
                })
              }
            />
            <RailButton
              to="/crypto"
              label="Crypto"
              note="USDT · BTC · Apex+"
              onSelect={() =>
                trackCommerce("add_to_cart", {
                  product_sku: product.sku,
                  product_slug: product.slug,
                  quantity: 1,
                  value: product.usdMinor / 100,
                  currency: "USD",
                  variant: "crypto",
                })
              }
            />
            <RailButton
              to="/selar"
              label="Selar"
              note="Digital downloads"
              onSelect={() =>
                trackCommerce("add_to_cart", {
                  product_sku: product.sku,
                  product_slug: product.slug,
                  quantity: 1,
                  value: product.ngnMinor / 100,
                  currency: "NGN",
                  variant: "selar",
                })
              }
            />
          </div>

          <div className="mt-8 text-center">
            <Link to="/products" className="text-sm text-muted-foreground hover:text-gold">
              ← Change product
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function RailButton({
  to,
  label,
  note,
  recommended,
  search,
  onSelect,
}: {
  to: "/paystack" | "/shopify" | "/crypto" | "/selar";
  label: string;
  note: string;
  recommended?: boolean;
  search?: { sku?: string };
  onSelect?: () => void;
}) {
  const cls = recommended
    ? "glass rounded-md p-5 border-2 border-[var(--gold)] shadow-gold"
    : "glass rounded-md p-5 hover:border-[var(--gold)] transition";
  return (
    <Link to={to} search={search as never} className={cls} onClick={onSelect}>
      <div className="flex items-center justify-between">
        <span className="font-display text-lg">{label}</span>
        {recommended && (
          <span className="text-[10px] tracking-widest uppercase bg-gold-gradient text-[var(--ink)] px-2 py-0.5 rounded-sm font-semibold">
            Recommended
          </span>
        )}
      </div>
      <div className="text-xs tracking-widest uppercase text-muted-foreground mt-2">{note}</div>
    </Link>
  );
}