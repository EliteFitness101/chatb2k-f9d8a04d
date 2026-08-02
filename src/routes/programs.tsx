import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { products, formatNGN } from "@/lib/catalog";
import { pageMeta, breadcrumbScript, canonicalLink, SITE_URL } from "@/lib/site-meta";

export const Route = createFileRoute("/programs")({
  head: () => ({
    meta: pageMeta({
      title: "Programs",
      description:
        "Fitness and wellness programs — periodised training doctrine, ancestral nutrition, and mobility protocols engineered by Coach Buchi.",
      url: SITE_URL + "/programs",
    }),
    links: [canonicalLink(SITE_URL + "/programs")],
    scripts: [
      breadcrumbScript([
        { name: "Home", url: SITE_URL + "/" },
        { name: "Programs", url: SITE_URL + "/programs" },
      ]),
    ],
  }),
  component: ProgramsPage,
});

const PILLARS = [
  { k: "01", t: "Mechanical", d: "Periodised strength work. Progressive load, audited form, measurable output." },
  { k: "02", t: "Metabolic", d: "Ancestral fuel framework built around Nigerian and Western kitchens alike." },
  { k: "03", t: "Mobility", d: "Joint architecture and recovery sequencing so the load never outruns the frame." },
];

function ProgramsPage() {
  const programs = products.filter((p) => p.category === "digital" || p.category === "coaching");

  return (
    <SiteShell>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Layer · Programs"
          title="Fitness and wellness doctrine."
          sub="Three pillars. One system. Delivered digitally, executed physically."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.k} className="glass rounded-md p-6">
              <div className="text-xs tracking-[0.3em] text-gold">{p.k}</div>
              <div className="font-display text-xl mt-3">{p.t}</div>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{p.d}</p>
            </div>
          ))}
        </div>

        <h2 className="font-display text-2xl mt-16">Available programmes</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {programs.map((p) => (
            <div key={p.sku} className="glass rounded-md p-6 flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-display text-lg truncate">{p.title}</div>
                  <div className="text-xs tracking-widest uppercase text-gold mt-1">{p.tagline}</div>
                </div>
                <div className="shrink-0 font-display text-lg text-gold-gradient">{formatNGN(p.ngnMinor)}</div>
              </div>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed flex-1">{p.description}</p>
              <ul className="mt-4 space-y-1">
                {p.highlights.map((h) => (
                  <li key={h} className="text-xs text-foreground/80 flex gap-2">
                    <span className="text-gold">▸</span>
                    {h}
                  </li>
                ))}
              </ul>
              <Link
                to="/checkout"
                search={{ sku: p.sku }}
                className="mt-6 text-center px-4 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm"
              >
                Enrol
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-14 glass rounded-md p-8 text-center">
          <div className="font-display text-xl">Not sure which programme?</div>
          <p className="text-sm text-muted-foreground mt-2">
            Run the ChatB2K assessment — it maps your load, goal, and schedule to the right protocol.
          </p>
          <Link to="/chatb2k" className="inline-block mt-6 px-5 py-3 rounded-sm border border-[var(--gold)] text-gold text-sm">
            Open ChatB2K →
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
