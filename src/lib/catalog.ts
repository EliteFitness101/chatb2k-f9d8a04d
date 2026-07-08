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