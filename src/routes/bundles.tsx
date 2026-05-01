import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { products, formatNGN, formatUSD } from "@/lib/catalog";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/bundles")({
  head: () => ({
    meta: pageMeta({
      title: "The Apex Bundle",
      description: "The Buchi Power Apex Bundle — full sanctuary, codified. ₦380,000.",
    }),
  }),
  component: BundlesPage,
});

function BundlesPage() {
  const apex = products.find((p) => p.apex)!;
  return (
    <SiteShell>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Apex"
          title="The complete sanctuary."
          sub="One purchase. Every weapon. White-glove delivery from your nearest hub."
          align="center"
        />
        <div className="mt-12 glass rounded-md p-10 grid md:grid-cols-2 gap-10 items-center">
          <div className="relative aspect-square rounded-sm bg-[var(--ink)] border border-[var(--glass-border)] overflow-hidden">
            <div className="absolute inset-0 ember-bg" />
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="font-display text-7xl text-gold-gradient">APEX</div>
                <div className="mt-2 text-xs tracking-[0.4em] text-gold uppercase">Buchi · Verified</div>
              </div>
            </div>
          </div>
          <div>
            <h2 className="font-display text-3xl">{apex.title}</h2>
            <p className="mt-3 text-muted-foreground">{apex.description}</p>
            <ul className="mt-6 space-y-2 text-sm">
              {apex.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2">
                  <span className="text-gold mt-1">◆</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex items-baseline gap-3 border-t border-[var(--glass-border)] pt-6">
              <span className="font-display text-4xl text-gold-gradient">{formatNGN(apex.ngnMinor)}</span>
              <span className="text-sm text-muted-foreground">/ {formatUSD(apex.usdMinor)}</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/checkout" search={{ sku: apex.sku }} className="px-6 py-3.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold">
                Claim the Apex
              </Link>
              <Link to="/products" className="px-6 py-3.5 rounded-sm glass">View arsenal</Link>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}