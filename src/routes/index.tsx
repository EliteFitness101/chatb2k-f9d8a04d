import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { ProductCard } from "@/components/site/ProductCard";
import { CurrencyBadge } from "@/components/site/CurrencyBadge";
import { products, formatNGN } from "@/lib/catalog";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta({
      title: "The Global Mechanical Authority",
      description:
        "ResoFlex™ Global Sanctuary — cast iron, ancestral doctrine, and white-glove fulfilment from hubs in Nigeria, the United States and Canada.",
    }),
  }),
  component: Index,
});

function Index() {
  const apex = products.find((p) => p.apex)!;
  const featured = products.filter((p) => ["iron", "bench"].includes(p.category)).slice(0, 4);
  return (
    <SiteShell>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 ember-bg pointer-events-none" />
        <div className="absolute inset-0 [background:radial-gradient(circle_at_30%_40%,oklch(0.78_0.13_87/0.12),transparent_55%)] pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-20 sm:pt-28 pb-24 sm:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <CurrencyBadge />
            <h1 className="mt-6 font-display text-5xl sm:text-6xl md:text-7xl leading-[1.05]">
              The global <span className="text-gold-gradient">mechanical</span> authority.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
              ResoFlex™ delivers cast iron, ancestral doctrine, and white-glove
              fulfilment from sanctuaries in Abia, Lagos, Port Harcourt, Jersey
              City and Ottawa. One identity. Verified globally.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/bundles"
                className="px-6 py-3.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold tracking-wide shadow-gold hover:brightness-110 transition"
              >
                Claim the Apex Bundle
              </Link>
              <Link
                to="/products"
                className="px-6 py-3.5 rounded-sm glass text-foreground font-medium hover:border-[var(--gold)] transition"
              >
                Inspect the Arsenal
              </Link>
            </div>
          </motion.div>

          {/* Authority strip */}
          <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { k: "7", v: "Global Hubs" },
              { k: "3", v: "Continents" },
              { k: "₦380k+", v: "Apex Bundle" },
              { k: "100%", v: "Buchi-Approved" },
            ].map((s) => (
              <div key={s.v} className="glass rounded-md p-5 text-center">
                <div className="font-display text-3xl text-gold-gradient">{s.k}</div>
                <div className="text-xs tracking-widest uppercase text-muted-foreground mt-1">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* APEX BUNDLE FEATURE */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <div className="glass rounded-md overflow-hidden grid md:grid-cols-2">
          <div className="p-8 sm:p-12 flex flex-col justify-center">
            <div className="text-xs tracking-[0.3em] uppercase text-gold mb-4">
              The Apex Bundle
            </div>
            <h2 className="font-display text-4xl sm:text-5xl">
              {apex.title}
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              {apex.description}
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {apex.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <span className="text-gold">◆</span> {h}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex items-baseline gap-4">
              <span className="font-display text-4xl text-gold-gradient">
                {formatNGN(apex.ngnMinor)}
              </span>
              <span className="text-sm text-muted-foreground">/ unit · global</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/products/$slug"
                params={{ slug: apex.slug }}
                className="px-5 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold"
              >
                Claim now
              </Link>
              <Link
                to="/checkout"
                className="px-5 py-3 rounded-sm glass text-foreground"
              >
                Smart checkout →
              </Link>
            </div>
          </div>
          <div className="relative bg-[var(--ink)] min-h-[320px] flex items-center justify-center border-l border-[var(--glass-border)]">
            <div className="absolute inset-0 ember-bg" />
            <div className="relative text-center">
              <div className="font-display text-7xl text-gold-gradient leading-none">
                APEX
              </div>
              <div className="mt-3 tracking-[0.4em] text-xs text-gold uppercase">
                Buchi · Power · Verified
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED ARSENAL */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        <SectionHeading
          eyebrow="The Arsenal"
          title="Iron and steel, codified."
          sub="Every plate, bar and bench dispatched from your nearest hub. Hand-finished. Verified. Delivered."
        />
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {featured.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/products"
            className="inline-block px-6 py-3 rounded-sm glass hover:border-[var(--gold)] transition"
          >
            View full arsenal →
          </Link>
        </div>
      </section>

      {/* RAILS */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <SectionHeading
          eyebrow="Financial Router"
          title="Pay your way. We verify."
          sub="The system detects your geography and routes you to the right rail. Manual override always available."
        />
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { to: "/paystack" as const, label: "Paystack", note: "Nigeria · NGN" },
            { to: "/shopify" as const, label: "Shopify", note: "USD / GBP / EUR" },
            { to: "/crypto" as const, label: "Crypto", note: "USDT · BTC · Apex+" },
            { to: "/selar" as const, label: "Selar", note: "Digital downloads" },
          ].map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="glass rounded-md p-6 hover:shadow-gold transition group"
            >
              <div className="font-display text-2xl group-hover:text-gold transition">
                {r.label}
              </div>
              <div className="text-xs tracking-widest uppercase text-muted-foreground mt-2">
                {r.note}
              </div>
              <div className="mt-6 text-sm text-gold opacity-0 group-hover:opacity-100 transition">
                Open rail →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* HUBS */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <SectionHeading
              eyebrow="Global Sanctuaries"
              title="One brand. Seven hubs. Three continents."
              sub="Global HQ in Umudike. National branches in Lagos and Port Harcourt. International hubs in Jersey City and Ottawa."
            />
            <Link
              to="/hubs"
              className="mt-8 inline-block px-6 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold"
            >
              Locate the nearest hub →
            </Link>
          </div>
          <div className="glass rounded-md p-8 grid grid-cols-2 gap-4 text-sm">
            {[
              ["Abia, NG", "Global HQ"],
              ["Lagos, NG", "Lekki × 2"],
              ["Port Harcourt", "Sobaz · Shell RA"],
              ["Jersey City, US", "108 CraneFord"],
              ["Ottawa, CA", "Wellness Villa"],
              ["Worldwide", "White-glove"],
            ].map(([city, label]) => (
              <div key={city} className="border border-[var(--glass-border)] rounded-sm p-4">
                <div className="text-gold text-xs uppercase tracking-widest">{label}</div>
                <div className="font-display text-lg mt-1">{city}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
