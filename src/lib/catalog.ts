// ResoFlex SKU Architecture — single source of truth for product display and pricing.
// Prices in NGN (kobo) and USD (cents) for dual-rail checkout.

export type Category = "iron" | "bench" | "digital" | "coaching" | "bundle";

export interface Product {
  slug: string;
  sku: string;
  title: string;
  tagline: string;
  description: string;
  category: Category;
  ngnMinor: number; // kobo
  usdMinor: number; // cents
  badge?: string;
  highlights: string[];
  weightKg?: number;
  apex?: boolean;
  /**
   * When present, checkout routes through Paystack Shop (hosted page) instead
   * of the inline SDK. Price is authoritative on the hosted page — the local
   * ngnMinor/usdMinor values are display-only fallbacks.
   */
  paystackShopUrl?: string;
}

export const products: Product[] = [
  {
    slug: "cast-iron-15kg",
    sku: "RES-IRON-15",
    title: "Cast Iron Set — 15 kg",
    tagline: "Foundation set. Buchi-Approved.",
    description:
      "Solid cast iron plates with chrome-finished spinlock bar. Engineered for the home sanctuary. The starting weight that initiates a lifetime of mechanical authority.",
    category: "iron",
    weightKg: 15,
    ngnMinor: 8500000, // ₦85,000
    usdMinor: 13900,
    highlights: ["Solid cast iron", "Chrome spinlock bar", "Lifetime warranty"],
  },
  {
    slug: "cast-iron-30kg",
    sku: "RES-IRON-30",
    title: "Cast Iron Set — 30 kg",
    tagline: "The intermediate authority.",
    description:
      "Doubled load. Same uncompromised iron. The 30 kg set unlocks compound lifts and serves as the gateway to the Apex programme.",
    category: "iron",
    weightKg: 30,
    ngnMinor: 14500000,
    usdMinor: 23900,
    highlights: ["6 × 5 kg plates", "Twin spinlock bars", "Hub-delivered"],
  },
  {
    slug: "cast-iron-50kg",
    sku: "RES-IRON-50",
    title: "Cast Iron Set — 50 kg",
    tagline: "Full ancestral load.",
    description:
      "The complete cast iron sanctuary. Fifty kilograms of authority, hand-finished, tested and verified before dispatch from the nearest hub.",
    category: "iron",
    weightKg: 50,
    ngnMinor: 22000000,
    usdMinor: 35900,
    badge: "Most Popular",
    highlights: ["Full Olympic stack", "White-glove delivery", "Buchi-Approved"],
  },
  {
    slug: "elite-bench",
    sku: "RES-BENCH-01",
    title: "Elite Adjustable Bench",
    tagline: "3 mm industrial steel.",
    description:
      "Seven-position adjustable bench cut from 3 mm industrial steel. Marine-grade leather. Engineered for two centuries of pressing.",
    category: "bench",
    ngnMinor: 18500000,
    usdMinor: 29900,
    highlights: ["3 mm steel frame", "7 positions", "Marine leather"],
  },
  {
    slug: "ancestral-nutrition",
    sku: "RES-DIG-NUT",
    title: "Ancestral Nutrition Protocol",
    tagline: "Digital. Lifetime access.",
    description:
      "Our complete nutritional doctrine — meal architecture, macronutrient sequencing, and the ancestral fuel framework. Delivered instantly.",
    category: "digital",
    ngnMinor: 1490000, // ₦14,900
    usdMinor: 4900,
    highlights: ["PDF + video", "Lifetime updates", "Instant delivery"],
  },
  {
    slug: "90-day-protocol",
    sku: "RES-DIG-90D",
    title: "90-Day Mechanical Protocol",
    tagline: "Digital training doctrine.",
    description:
      "Twelve weeks of programmed mechanical work. Periodised, audited, and delivered as a digital programme paired with form-check video.",
    category: "digital",
    ngnMinor: 1990000, // ₦19,900
    usdMinor: 6900,
    highlights: ["12-week structured plan", "Video form library", "Digital download"],
  },
  {
    slug: "app-plus-coaching",
    sku: "RES-COACH-01",
    title: "App Plus — 1-on-1 Coaching",
    tagline: "Monthly subscription.",
    description:
      "The ResoFlex App with personalised 1-on-1 coaching. Weekly check-ins, programme adjustment, and direct access to your assigned coach.",
    category: "coaching",
    ngnMinor: 39900000, // ₦399,000 — Elite Coaching
    usdMinor: 11900,
    highlights: ["Weekly check-ins", "Custom programming", "Direct chat"],
  },
  {
    slug: "buchi-power-apex",
    sku: "RES-BUNDLE-APEX",
    title: "The Buchi Power Apex Bundle",
    tagline: "The complete sanctuary.",
    description:
      "Full 50 kg cast iron stack, Elite Adjustable Bench, Ancestral Nutrition, 90-Day Protocol, and three months of 1-on-1 App Plus coaching. The ResoFlex experience, codified.",
    category: "bundle",
    ngnMinor: 38000000, // ₦380,000
    usdMinor: 59900,
    badge: "Apex",
    apex: true,
    highlights: [
      "50 kg Cast Iron Set",
      "Elite Adjustable Bench",
      "Ancestral Nutrition Protocol",
      "90-Day Mechanical Protocol",
      "3 months App Plus coaching",
      "White-glove delivery",
    ],
  },
];

// Premium digital access SKU used by /elite-checkout. Server-priced.
products.push({
  slug: "elite-access",
  sku: "RES-ELITE-ACCESS",
  title: "ResoFlex Elite Access",
  tagline: "The Sovereign tier. Lifetime access.",
  description:
    "Unlock the full Elite-LuxeGold blueprint vault, Apex protocols, and member-only drops.",
  category: "digital",
  ngnMinor: 25000000, // ₦250,000
  usdMinor: 15900,
  badge: "Elite",
  highlights: ["Lifetime access", "Sovereign vault", "Apex protocols"],
});

// ─────────────────────────────────────────────────────────────────────────────
// Coach Buchi Iron Authority™ — Paystack Shop registry (external checkout).
// Prices on the hosted Paystack page are the source of truth; the NGN values
// below are display fallbacks only. Do not duplicate these slugs elsewhere.
// ─────────────────────────────────────────────────────────────────────────────
const coachBuchiRegistry: Product[] = [
  {
    slug: "naijafit-tier2-5000",
    sku: "NF-TIER2-5000",
    title: "NaijaFit™ Enhanced Wellness Plan",
    tagline: "Enhanced wellness. Tier 2.",
    description: "The Enhanced Wellness tier of the NaijaFit™ system.",
    category: "digital",
    ngnMinor: 500000,
    usdMinor: 500,
    highlights: ["Enhanced protocol", "Instant delivery"],
    paystackShopUrl: "https://paystack.shop/pay/naijafit-5000",
  },
  {
    slug: "fitness-evolution",
    sku: "CB-FIT-EVO",
    title: "Fitness Evolution™",
    tagline: "The evolution doctrine.",
    description: "Coach Buchi's flagship fitness evolution programme.",
    category: "digital",
    ngnMinor: 1500000,
    usdMinor: 1500,
    highlights: ["Structured programme", "Digital delivery"],
    paystackShopUrl: "https://paystack.shop/pay/fitness-evolution",
  },
  {
    slug: "heritage-meal",
    sku: "CB-HERITAGE-MEAL",
    title: "Heritage Meal Protocol",
    tagline: "Ancestral nutrition, codified.",
    description: "Heritage meal architecture and macronutrient sequencing.",
    category: "digital",
    ngnMinor: 1000000,
    usdMinor: 1000,
    highlights: ["Meal plans", "Ancestral fuel framework"],
    paystackShopUrl: "https://paystack.shop/pay/heritage-meal",
  },
  {
    slug: "buttgrowthb2k",
    sku: "B2K-CORE",
    title: "Butt Growth B2K",
    tagline: "The B2K system.",
    description: "Coach Buchi's Butt Growth B2K programme.",
    category: "digital",
    ngnMinor: 2500000,
    usdMinor: 2500,
    highlights: ["B2K methodology", "Digital delivery"],
    paystackShopUrl: "https://paystack.shop/pay/buttgrowthb2k",
  },
  {
    slug: "rf-expansion-module-blue",
    sku: "RF-EXP-BLUE",
    title: "ResoFlex Expansion Module — Blue",
    tagline: "Expansion module. Blue tier.",
    description: "ResoFlex expansion add-on — Blue tier module.",
    category: "iron",
    ngnMinor: 1500000,
    usdMinor: 1500,
    highlights: ["Expansion module", "Blue tier"],
    paystackShopUrl: "https://paystack.shop/pay/rf-expansion-blue",
  },
  {
    slug: "rf-expansion-module-duo",
    sku: "RF-EXP-DUO",
    title: "ResoFlex Expansion Module — Duo",
    tagline: "Expansion module. Duo.",
    description: "ResoFlex expansion add-on — Duo configuration.",
    category: "iron",
    ngnMinor: 2500000,
    usdMinor: 2500,
    highlights: ["Expansion module", "Duo configuration"],
    paystackShopUrl: "https://paystack.shop/pay/rf-expansion-duo",
  },
  {
    slug: "rf-elite-coaching-30day",
    sku: "RF-COACH-30",
    title: "ResoFlex Elite 30-Day Coaching",
    tagline: "30-day elite coaching cycle.",
    description: "Thirty days of Elite 1-on-1 coaching with Coach Buchi's team.",
    category: "coaching",
    ngnMinor: 15000000,
    usdMinor: 15000,
    badge: "Elite",
    highlights: ["30-day cycle", "1-on-1 coaching", "Weekly check-ins"],
    paystackShopUrl: "https://paystack.shop/pay/rf-coaching-30",
  },
  {
    slug: "buttgrowthb2k-starter",
    sku: "B2K-STARTER",
    title: "B2K Starter Kit",
    tagline: "Enter the B2K system.",
    description: "The B2K Starter Kit — first tier of the Butt Growth B2K ladder.",
    category: "digital",
    ngnMinor: 1000000,
    usdMinor: 1000,
    highlights: ["Entry tier", "Digital delivery"],
    paystackShopUrl: "https://paystack.shop/pay/b2k-starter",
  },
  {
    slug: "buttgrowthb2k-core",
    sku: "B2K-CORE-SYS",
    title: "B2K Core System",
    tagline: "The core protocol.",
    description: "The complete B2K Core System.",
    category: "digital",
    ngnMinor: 2500000,
    usdMinor: 2500,
    highlights: ["Core system", "Full programme"],
    paystackShopUrl: "https://paystack.shop/pay/b2k-core",
  },
  {
    slug: "buttgrowthb2k-pro",
    sku: "B2K-PRO",
    title: "B2K Pro Sculpt System",
    tagline: "Pro sculpt tier.",
    description: "The B2K Pro Sculpt System — advanced tier.",
    category: "digital",
    ngnMinor: 4500000,
    usdMinor: 4500,
    highlights: ["Pro sculpt", "Advanced tier"],
    paystackShopUrl: "https://paystack.shop/pay/b2k-pro",
  },
  {
    slug: "buttgrowthb2k-elite",
    sku: "B2K-ELITE-90",
    title: "B2K Elite 90-Day Transformation",
    tagline: "90-day elite transformation.",
    description: "The B2K Elite 90-Day Transformation — top tier of the B2K ladder.",
    category: "coaching",
    ngnMinor: 9000000,
    usdMinor: 9000,
    badge: "Elite",
    highlights: ["90-day cycle", "Elite tier", "Full transformation"],
    paystackShopUrl: "https://paystack.shop/pay/b2k-elite",
  },
  {
    slug: "rf-90day-metabolic-blueprint",
    sku: "RF-90D-METABOLIC",
    title: "90-Day Metabolic Blueprint",
    tagline: "Ninety-day metabolic architecture.",
    description: "The 90-Day Metabolic Blueprint — Coach Buchi's metabolic doctrine.",
    category: "digital",
    ngnMinor: 3500000,
    usdMinor: 3500,
    highlights: ["90-day plan", "Metabolic architecture"],
  },
];

// Merge guard — refuse to introduce duplicate slugs or SKUs.
for (const p of coachBuchiRegistry) {
  if (products.some((x) => x.slug === p.slug || x.sku === p.sku)) continue;
  products.push(p);
}

export const productBySlug = (slug: string) =>
  products.find((p) => p.slug === slug);

export const productBySku = (sku: string) =>
  products.find((p) => p.sku === sku);

export function formatNGN(minor: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function formatUSD(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function priceFor(product: Product, currency: "NGN" | "USD") {
  return currency === "NGN"
    ? formatNGN(product.ngnMinor)
    : formatUSD(product.usdMinor);
}