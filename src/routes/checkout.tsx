import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { products, productBySku, formatNGN, formatUSD } from "@/lib/catalog";
import { getGeo } from "@/lib/geo.functions";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/checkout")({
  validateSearch: (s) => z.object({ sku: z.string().optional() }).parse(s),
  head: () => ({
    meta: pageMeta({
      title: "Smart Checkout",
      description: "The Financial Router — pay via the rail nearest to you.",
    }),
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
            />
            <RailButton
              to="/shopify"
              label="Shopify"
              note="USD / GBP / EUR"
              recommended={!isNG && !!geo}
            />
            <RailButton to="/crypto" label="Crypto" note="USDT · BTC · Apex+" />
            <RailButton to="/selar" label="Selar" note="Digital downloads" />
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
}: {
  to: "/paystack" | "/shopify" | "/crypto" | "/selar";
  label: string;
  note: string;
  recommended?: boolean;
  search?: { sku?: string };
}) {
  const cls = recommended
    ? "glass rounded-md p-5 border-2 border-[var(--gold)] shadow-gold"
    : "glass rounded-md p-5 hover:border-[var(--gold)] transition";
  return (
    <Link to={to} search={search as never} className={cls}>
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