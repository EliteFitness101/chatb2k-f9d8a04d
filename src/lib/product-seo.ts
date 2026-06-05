// Premium SEO metadata for every product slug. Brand voice: Obsidian + Gold.

export interface ProductSeo {
  title: string;
  description: string;
  ogImage: string;
  alt: string;
}

const BASE = "https://resoflex-global.lovable.app";
const img = (slug: string) => `${BASE}/images/products/${slug}.jpg`;

export const PRODUCT_SEO: Record<string, ProductSeo> = {
  "cast-iron-15kg": {
    title: "Cast Iron Set — 15 kg | ResoFlex Foundation Authority",
    description:
      "Solid cast iron plates and chrome spinlock bar. The 15 kg foundation set engineered for the home sanctuary. Buchi-Approved. Hub delivery.",
    ogImage: img("cast-iron-15kg"),
    alt: "ResoFlex 15 kg cast iron set on obsidian backdrop with gold highlight",
  },
  "cast-iron-30kg": {
    title: "Cast Iron Set — 30 kg | ResoFlex Intermediate Authority",
    description:
      "Doubled load, uncompromised iron. The 30 kg ResoFlex set unlocks compound lifts and the gateway to the Apex programme.",
    ogImage: img("cast-iron-30kg"),
    alt: "ResoFlex 30 kg cast iron plates and twin spinlock bars in premium obsidian + gold finish",
  },
  "cast-iron-50kg": {
    title: "Cast Iron Set — 50 kg | ResoFlex Full Ancestral Load",
    description:
      "The complete cast iron sanctuary. 50 kg of authority, hand-finished and tested. White-glove delivery from the nearest ResoFlex hub.",
    ogImage: img("cast-iron-50kg"),
    alt: "ResoFlex 50 kg full cast iron Olympic stack, obsidian + gold premium edition",
  },
  "elite-bench": {
    title: "Elite Adjustable Bench | 3 mm Industrial Steel | ResoFlex",
    description:
      "Seven-position adjustable bench cut from 3 mm industrial steel. Marine-grade leather. Engineered for two centuries of pressing.",
    ogImage: img("elite-bench"),
    alt: "ResoFlex Elite Adjustable Bench with 3 mm industrial steel frame and marine leather",
  },
  "ancestral-nutrition": {
    title: "Ancestral Nutrition Protocol — Digital Doctrine | ResoFlex",
    description:
      "Meal architecture, macronutrient sequencing, and the ancestral fuel framework. Lifetime access. Instant delivery.",
    ogImage: img("ancestral-nutrition"),
    alt: "Ancestral Nutrition Protocol cover — premium obsidian + gold ResoFlex digital programme",
  },
  "90-day-protocol": {
    title: "90-Day Mechanical Protocol — Digital Training | ResoFlex",
    description:
      "Twelve weeks of programmed mechanical work. Periodised, audited and paired with form-check video. Digital delivery.",
    ogImage: img("90-day-protocol"),
    alt: "ResoFlex 90-Day Mechanical Protocol — digital training cover in obsidian + gold",
  },
  "app-plus-coaching": {
    title: "App Plus — 1-on-1 Coaching | ResoFlex Monthly",
    description:
      "The ResoFlex App with personalised 1-on-1 coaching. Weekly check-ins, custom programming, direct chat with your coach.",
    ogImage: img("app-plus-coaching"),
    alt: "ResoFlex App Plus 1-on-1 coaching — premium gold and obsidian dashboard",
  },
  "buchi-power-apex": {
    title: "Buchi Power Apex Bundle | Complete ResoFlex Sanctuary",
    description:
      "50 kg cast iron, Elite Bench, Ancestral Nutrition, 90-Day Protocol, and 3 months App Plus coaching. The ResoFlex experience, codified.",
    ogImage: img("buchi-power-apex"),
    alt: "Buchi Power Apex Bundle — full ResoFlex sanctuary in obsidian and gold",
  },
  "elite-access": {
    title: "ResoFlex Elite Access — Sovereign Lifetime Vault",
    description:
      "Unlock the full Elite-LuxeGold blueprint vault, Apex protocols, and member-only drops. Lifetime sovereign access.",
    ogImage: img("elite-access"),
    alt: "ResoFlex Elite Access — Sovereign lifetime vault in obsidian + gold",
  },
};

export function getProductSeo(slug: string): ProductSeo | null {
  return PRODUCT_SEO[slug] ?? null;
}