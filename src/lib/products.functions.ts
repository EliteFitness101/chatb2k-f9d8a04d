import { products } from "@/lib/catalog";

export type CanonicalProduct = {
  slug: string;
  name: string;
  price_ngn: number;
  active: boolean;
};

export async function listProducts(): Promise<{ products: CanonicalProduct[] }> {
  return {
    products: products.map((product) => ({
      slug: product.slug,
      name: product.title,
      price_ngn: product.ngnMinor / 100,
      active: true,
    })),
  };
}
