import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: pageMeta({
      title: "Authority",
      description: "The ancestral doctrine of ResoFlex™ — codified, verified, globally fulfilled.",
    }),
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-4xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Authority"
          title="Iron is doctrine. Doctrine is destiny."
          sub="ResoFlex™ began in Umudike. It now operates across three continents."
        />
        <div className="mt-12 space-y-8 text-foreground/85 leading-relaxed">
          <p>
            Founded as the personal sanctuary of a single mechanical philosophy,
            ResoFlex™ has codified the ancestral doctrine of disciplined iron and
            white-glove fulfilment into a global brand. Every plate is hand-finished.
            Every bench is forged from 3 mm industrial steel. Every protocol is
            audited before release.
          </p>
          <p>
            From our Global HQ at Melrose Plaza in Umudike, Abia, we operate
            national branches in Lagos and Port Harcourt and international
            sanctuaries in Jersey City and Ottawa. The system routes each customer
            to their nearest hub — automatically.
          </p>
          <p className="text-gold tracking-widest uppercase text-xs">
            Buchi-Approved · Globally Verified
          </p>
        </div>
      </section>
    </SiteShell>
  );
}