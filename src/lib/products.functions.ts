import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CanonicalProduct = {
  slug: string;
  name: string;
  price_ngn: number;
  active: boolean;
};

export const listProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("sku,title,variant_price,published")
    .eq("published", true)
    .order("title", { ascending: true });

  if (error) {
    console.error("[products] canonical product list failed", error);
    throw new Error("Could not load canonical products");
  }

  return {
    products: (data ?? [])
      .filter((p) => p.variant_price != null && Number(p.variant_price) > 0)
      .map((p) => ({
        slug: p.sku,
        name: p.title,
        price_ngn: Number(p.variant_price),
        active: p.published === true,
      })),
  };
});
