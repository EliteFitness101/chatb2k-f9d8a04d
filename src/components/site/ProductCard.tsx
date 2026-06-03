import { Link } from "@tanstack/react-router";
import { Product, formatNGN, formatUSD } from "@/lib/catalog";
import { findGalleryImage, useGalleryBySlot } from "@/hooks/use-gallery";

export function ProductCard({
  product,
  currency = "NGN",
}: {
  product: Product;
  currency?: "NGN" | "USD";
}) {
  const price = currency === "NGN" ? formatNGN(product.ngnMinor) : formatUSD(product.usdMinor);
  const gallery = useGalleryBySlot("products");
  const img = findGalleryImage(gallery, [product.sku, product.slug, product.title]);
  return (
    <Link
      to="/products/$slug"
      params={{ slug: product.slug }}
      className="group glass rounded-md p-6 flex flex-col gap-4 hover:shadow-gold transition-shadow relative overflow-hidden"
    >
      <div className="aspect-[4/3] rounded-sm bg-[var(--ink)] border border-[var(--glass-border)] relative overflow-hidden">
        {img ? (
          <img
            src={img.url}
            alt={img.label || product.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.src = "/images/fallback/premium-placeholder.webp";
            }}
          />
        ) : (
          <>
            <div className="absolute inset-0 ember-bg opacity-60" />
            <div className="absolute inset-0 grid place-items-center">
              <Glyph category={product.category} weight={product.weightKg} />
            </div>
          </>
        )}
        {product.badge && (
          <span className="absolute top-3 left-3 text-[10px] tracking-[0.2em] uppercase bg-gold-gradient text-[var(--ink)] px-2.5 py-1 rounded-sm font-semibold">
            {product.badge}
          </span>
        )}
      </div>
      <div className="flex-1">
        <div className="text-xs uppercase tracking-widest text-gold/80">{product.category}</div>
        <h3 className="font-display text-xl mt-1">{product.title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{product.tagline}</p>
      </div>
      <div className="flex items-baseline justify-between pt-2 border-t border-[var(--glass-border)]">
        <span className="text-lg font-semibold text-gold">{price}</span>
        <span className="text-xs text-muted-foreground group-hover:text-gold transition-colors">View →</span>
      </div>
    </Link>
  );
}

function Glyph({ category, weight }: { category: Product["category"]; weight?: number }) {
  if (category === "iron") {
    return (
      <div className="text-center">
        <svg width="80" height="40" viewBox="0 0 80 40">
          <rect x="0" y="14" width="6" height="12" fill="oklch(0.78 0.13 87)" />
          <rect x="74" y="14" width="6" height="12" fill="oklch(0.78 0.13 87)" />
          <rect x="6" y="18" width="68" height="4" fill="oklch(0.5 0.05 80)" />
          <circle cx="14" cy="20" r="14" fill="oklch(0.15 0.005 90)" stroke="oklch(0.78 0.13 87)" strokeWidth="1.5" />
          <circle cx="66" cy="20" r="14" fill="oklch(0.15 0.005 90)" stroke="oklch(0.78 0.13 87)" strokeWidth="1.5" />
        </svg>
        {weight && <div className="font-display text-2xl text-gold mt-2">{weight} kg</div>}
      </div>
    );
  }
  if (category === "bench") {
    return (
      <svg width="100" height="60" viewBox="0 0 100 60">
        <rect x="20" y="20" width="60" height="8" fill="oklch(0.78 0.13 87)" />
        <rect x="22" y="28" width="4" height="28" fill="oklch(0.5 0.05 80)" />
        <rect x="74" y="28" width="4" height="28" fill="oklch(0.5 0.05 80)" />
        <rect x="35" y="10" width="30" height="6" fill="oklch(0.6 0.1 87)" />
      </svg>
    );
  }
  if (category === "bundle") return <div className="font-display text-4xl text-gold-gradient">APEX</div>;
  if (category === "coaching") return <div className="font-display text-3xl text-gold">1:1</div>;
  return <div className="font-display text-3xl text-gold">∞</div>;
}