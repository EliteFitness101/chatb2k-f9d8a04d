import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { ProductCard } from "@/components/site/ProductCard";
import { products } from "@/lib/catalog";
import { pageMeta, breadcrumbScript, canonicalLink, SITE_URL } from "@/lib/site-meta";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: pageMeta({
      title: "The Arsenal",
      description: "Cast iron, industrial benches, ancestral protocols and 1-on-1 coaching. The full ResoFlex arsenal.",
      url: SITE_URL + "/products",
      type: "website",
    }),
    links: [canonicalLink(SITE_URL + "/products")],
    scripts: [
      breadcrumbScript([
        { name: "Home", url: SITE_URL + "/" },
        { name: "Products", url: SITE_URL + "/products" },
      ]),
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="The Arsenal"
          title="Every weapon in the sanctuary."
          sub="Physical iron. Industrial gear. Digital doctrine. Recurring coaching. Apex bundles."
        />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </section>
    </SiteShell>
  );
}