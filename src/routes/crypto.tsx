import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/crypto")({
  head: () => ({
    meta: pageMeta({ title: "Crypto Rail", description: "Settle in USDT or BTC. For Apex+ tier orders." }),
  }),
  component: CryptoPage,
});

function CryptoPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-2xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Rail · Crypto"
          title="Settle in digital authority."
          sub="USDT · BTC. Reserved for Apex+ tier orders. Concierge verification."
        />
        <div className="mt-10 glass rounded-md p-8 text-center">
          <p className="text-muted-foreground">
            Crypto settlement is concierge-managed. To initiate, please proceed
            to smart checkout — our team will reach out within one business hour
            to verify wallet and assign a hub.
          </p>
          <div className="mt-8">
            <Link to="/checkout" className="px-5 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold">Begin verification</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}