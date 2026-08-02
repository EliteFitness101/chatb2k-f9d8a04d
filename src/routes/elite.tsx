import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { productBySku, formatNGN } from "@/lib/catalog";
import { pageMeta, breadcrumbScript, canonicalLink, SITE_URL } from "@/lib/site-meta";

export const Route = createFileRoute("/elite")({
  head: () => ({
    meta: pageMeta({
      title: "Elite Membership",
      description:
        "ResoFlex Elite — the sovereign tier. Blueprint vault, Apex protocols, concierge fulfilment, and member-only drops.",
      url: SITE_URL + "/elite",
    }),
    links: [canonicalLink(SITE_URL + "/elite")],
    scripts: [
      breadcrumbScript([
        { name: "Home", url: SITE_URL + "/" },
        { name: "Elite", url: SITE_URL + "/elite" },
      ]),
    ],
  }),
  component: ElitePage,
});

const TIERS = [
  {
    name: "Reset",
    price: "₦1,000",
    note: "Entry protocol",
    perks: ["Metabolic Reset assessment", "Starter meal architecture", "Community access"],
  },
  {
    name: "Elite",
    price: "₦250,000",
    note: "Lifetime · Sovereign vault",
    perks: ["Blueprint vault (lifetime)", "Apex protocols", "Member-only drops", "Priority hub routing"],
    featured: true,
    sku: "RES-ELITE-ACCESS",
  },
  {
    name: "LuxeGold",
    price: "₦399,000",
    note: "1-on-1 coaching · monthly",
    perks: ["Weekly 1-on-1 check-ins", "Custom programming", "Direct coach chat", "White-glove delivery"],
    sku: "RES-COACH-01",
  },
];

function ElitePage() {
  const apex = productBySku("RES-BUNDLE-APEX");

  return (
    <SiteShell>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Layer · Elite"
          title="Premium membership."
          sub="Three tiers of access. One standard of execution."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={
                t.featured
                  ? "glass rounded-md p-7 border-2 border-[var(--gold)] shadow-gold flex flex-col"
                  : "glass rounded-md p-7 flex flex-col"
              }
            >
              {t.featured && (
                <span className="self-start text-[10px] tracking-widest uppercase bg-gold-gradient text-[var(--ink)] px-2 py-0.5 rounded-sm font-semibold">
                  Sovereign
                </span>
              )}
              <div className="font-display text-2xl mt-3">{t.name}</div>
              <div className="text-xs tracking-widest uppercase text-muted-foreground mt-1">{t.note}</div>
              <div className="font-display text-3xl text-gold-gradient mt-5">{t.price}</div>
              <ul className="mt-6 space-y-2 flex-1">
                {t.perks.map((p) => (
                  <li key={p} className="text-sm text-foreground/85 flex gap-2">
                    <span className="text-gold shrink-0">✦</span>
                    {p}
                  </li>
                ))}
              </ul>
              {t.sku ? (
                <Link
                  to="/checkout"
                  search={{ sku: t.sku }}
                  className="mt-7 text-center px-4 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm"
                >
                  Claim {t.name}
                </Link>
              ) : (
                <Link
                  to="/quiz"
                  className="mt-7 text-center px-4 py-3 rounded-sm border border-[var(--gold)] text-gold text-sm"
                >
                  Start Reset
                </Link>
              )}
            </div>
          ))}
        </div>

        {apex && (
          <div className="mt-16 glass rounded-md p-8">
            <div className="text-xs tracking-[0.3em] uppercase text-gold">Apex Bundle</div>
            <h2 className="font-display text-2xl mt-3">{apex.title}</h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">{apex.description}</p>
            <ul className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {apex.highlights.map((h) => (
                <li key={h} className="text-sm text-foreground/85 flex gap-2">
                  <span className="text-gold shrink-0">▸</span>
                  {h}
                </li>
              ))}
            </ul>
            <div className="mt-7 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="font-display text-2xl text-gold-gradient">{formatNGN(apex.ngnMinor)}</div>
              <Link
                to="/checkout"
                search={{ sku: apex.sku }}
                className="shrink-0 px-5 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm"
              >
                Acquire Apex
              </Link>
            </div>
          </div>
        )}
      </section>
    </SiteShell>
  );
}
