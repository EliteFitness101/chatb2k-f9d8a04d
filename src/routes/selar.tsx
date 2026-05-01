import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/selar")({
  head: () => ({
    meta: pageMeta({ title: "Selar Rail", description: "Digital downloads — protocols and doctrine via Selar." }),
  }),
  component: SelarPage,
});

function SelarPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-2xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Rail · Selar"
          title="Digital downloads."
          sub="The Ancestral Nutrition Protocol and 90-Day Doctrine — delivered instantly via Selar."
        />
        <div className="mt-10 glass rounded-md p-8 text-center">
          <p className="text-muted-foreground">
            Selar storefront is being mirrored. Until launch, our digital
            doctrine is available via Paystack with instant download links.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/paystack" className="px-5 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold">Buy via Paystack</Link>
            <Link to="/checkout" className="px-5 py-3 rounded-sm glass">Back to checkout</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}