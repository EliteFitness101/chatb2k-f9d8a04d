import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { productBySlug, formatNGN, formatUSD } from "@/lib/catalog";
import { pageMeta } from "@/lib/site-meta";
import { findGalleryImage, useGalleryBySlot } from "@/hooks/use-gallery";
import { NigerianEcommerceTrustCheck } from "@/components/site/NigerianEcommerceTrustCheck";
import { FulfillmentEstimate } from "@/components/site/FulfillmentEstimate";
import { getProductSeo } from "@/lib/product-seo";

export const Route = createFileRoute("/products/$slug")({
  loader: ({ params }) => {
    const product = productBySlug(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => ({
    meta: (() => {
      const p = loaderData?.product;
      const seo = p ? getProductSeo(p.slug) : null;
      const title = seo?.title ?? p?.title ?? "Product";
      const description = seo?.description ?? p?.tagline ?? "";
      const url = p ? `https://resoflex-global.lovable.app/products/${p.slug}` : undefined;
      return [
        ...pageMeta({ title, description }),
        ...(seo?.ogImage ? [{ property: "og:image", content: seo.ogImage }] : []),
        ...(seo?.ogImage ? [{ name: "twitter:image", content: seo.ogImage }] : []),
        ...(url ? [{ property: "og:url", content: url }] : []),
        { property: "og:type", content: "product" },
      ];
    })(),
    links: loaderData?.product
      ? [
          {
            rel: "canonical",
            href: `https://resoflex-global.lovable.app/products/${loaderData.product.slug}`,
          },
        ]
      : [],
    scripts: loaderData?.product
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: loaderData.product.title,
              description: loaderData.product.description,
              sku: loaderData.product.sku,
              image: getProductSeo(loaderData.product.slug)?.ogImage,
              offers: {
                "@type": "Offer",
                priceCurrency: "NGN",
                price: (loaderData.product.ngnMinor / 100).toFixed(2),
                availability: "https://schema.org/InStock",
              },
            }),
          },
        ]
      : [],
  }),
  notFoundComponent: () => (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-32 text-center">
        <div className="text-xs tracking-[0.3em] uppercase text-gold">404</div>
        <h1 className="font-display text-4xl mt-3">Product not found.</h1>
        <Link to="/products" className="mt-6 inline-block text-gold">Back to Arsenal →</Link>
      </div>
    </SiteShell>
  ),
  errorComponent: ({ error }) => (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-32 text-center">
        <p className="text-destructive">{error.message}</p>
      </div>
    </SiteShell>
  ),
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData();
  const gallery = useGalleryBySlot("products");
  const img = findGalleryImage(gallery, [product.sku, product.slug, product.title]);
  const seo = getProductSeo(product.slug);
  const fallbackImg = seo?.ogImage;
  return (
    <SiteShell>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-20 grid md:grid-cols-2 gap-10">
        <div className="glass rounded-md aspect-square relative overflow-hidden">
          {img || fallbackImg ? (
            <img
              src={img?.url ?? fallbackImg}
              alt={seo?.alt ?? img?.label ?? product.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <>
              <div className="absolute inset-0 ember-bg" />
              <div className="absolute inset-0 grid place-items-center">
                <div className="font-display text-6xl text-gold-gradient">
                  {product.weightKg ? `${product.weightKg} kg` : product.category.toUpperCase()}
                </div>
              </div>
            </>
          )}
          {product.badge && (
            <span className="absolute top-4 left-4 text-[10px] tracking-[0.2em] uppercase bg-gold-gradient text-[var(--ink)] px-2.5 py-1 rounded-sm font-semibold">
              {product.badge}
            </span>
          )}
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-gold">{product.category}</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-3">{product.title}</h1>
          <p className="mt-3 text-muted-foreground">{product.tagline}</p>
          <p className="mt-6 leading-relaxed">{product.description}</p>
          <ul className="mt-6 space-y-2">
            {product.highlights.map((h: string) => (
              <li key={h} className="flex items-start gap-2 text-sm">
                <span className="text-gold mt-1">◆</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-baseline gap-4 border-t border-[var(--glass-border)] pt-6">
            <span className="font-display text-4xl text-gold-gradient">{formatNGN(product.ngnMinor)}</span>
            <span className="text-sm text-muted-foreground">/ {formatUSD(product.usdMinor)}</span>
          </div>
          <div className="mt-5 text-xs text-muted-foreground">SKU: {product.sku}</div>
          <NigerianEcommerceTrustCheck className="mt-6" />
          <FulfillmentEstimate className="mt-4" />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/checkout"
              search={{ sku: product.sku }}
              className="px-6 py-3.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold"
            >
              Buy Now →
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}