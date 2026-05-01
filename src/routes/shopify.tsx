import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/shopify")({
  head: () => ({
    meta: pageMeta({
      title: "Shopify Rail",
      description: "International orders processed via Shopify in USD, GBP and EUR.",
    }),
  }),
  component: ShopifyPage,
});

function ShopifyPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-2xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Rail · Shopify"
          title="International checkout."
          sub="USD · GBP · EUR. Routed to the Jersey City or Ottawa hub."
        />
        <div className="mt-10 glass rounded-md p-8 text-center">
          <p className="text-muted-foreground">
            Shopify storefront integration is being provisioned. Verified launch
            imminent. In the interim, please use the Naira rail or contact
            concierge for white-glove international fulfilment.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/paystack" className="px-5 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold">Pay in Naira</Link>
            <Link to="/checkout" className="px-5 py-3 rounded-sm glass">Back to checkout</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}