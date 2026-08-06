import { describe, it, expect } from "vitest";
import {
  cryptoEligible,
  toBaseMinor,
  formatMinor,
  FALLBACK_ROUTE,
  FX_TO_BASE,
} from "@/lib/commerce/regions";
import { recommend, ENGINE_VERSION, type AssessmentInput } from "@/lib/commerce/recommendation";
import { productBySku } from "@/lib/catalog";

const lean: AssessmentInput = {
  primary_goal: "cut",
  experience: "beginner",
  equipment: "none",
  nutrition: "omnivore",
  time_availability: "lt3",
  budget: "lean",
  mobility: "none",
};

describe("currency routing", () => {
  it("converts minor units into the base currency", () => {
    expect(toBaseMinor(100_00, "USD")).toBe(100_00 * FX_TO_BASE.USD);
    expect(toBaseMinor(50_000, "NGN")).toBe(50_000);
  });

  it("evaluates the crypto threshold in base currency", () => {
    const threshold = FALLBACK_ROUTE.cryptoThresholdMinor; // ₦380,000
    expect(cryptoEligible(37_000_000, "NGN", threshold)).toBe(false);
    expect(cryptoEligible(38_000_000, "NGN", threshold)).toBe(true);
    expect(cryptoEligible(30_000, "USD", threshold)).toBe(true);
  });

  it("formats amounts without throwing for every supported currency", () => {
    for (const c of Object.keys(FX_TO_BASE) as (keyof typeof FX_TO_BASE)[]) {
      expect(typeof formatMinor(123_456, c)).toBe("string");
    }
  });
});

describe("payment + fulfillment routing defaults", () => {
  it("falls back to the Nigerian Paystack/global-HQ route", () => {
    expect(FALLBACK_ROUTE.provider).toBe("paystack");
    expect(FALLBACK_ROUTE.currency).toBe("NGN");
    expect(FALLBACK_ROUTE.hubTier).toBe("global_hq");
  });
});

describe("ChatB2K recommendation engine", () => {
  it("is deterministic and versioned", () => {
    const a = recommend(lean);
    const b = recommend(lean);
    expect(a).toEqual(b);
    expect(a.engine_version).toBe(ENGINE_VERSION);
  });

  it("returns only known catalog SKUs with a matching subtotal", () => {
    const r = recommend(lean);
    for (const sku of r.ranked_skus) expect(productBySku(sku)).toBeTruthy();
    const sum = r.ranked_skus.reduce((s, sku) => s + (productBySku(sku)?.ngnMinor ?? 0), 0);
    expect(r.subtotal_ngn_minor).toBe(sum);
  });

  it("upgrades apex budgets to the bundle plus coaching", () => {
    const r = recommend({ ...lean, budget: "apex", experience: "advanced" });
    expect(r.equipment_skus).toEqual(["RES-BUNDLE-APEX"]);
    expect(r.membership_sku).toBe("RES-COACH-01");
    expect(r.upsell_score).toBeGreaterThan(recommend(lean).upsell_score);
  });

  it("skips equipment for commercial gym members", () => {
    const r = recommend({ ...lean, equipment: "gym", budget: "committed" });
    expect(r.equipment_skus).toEqual([]);
  });

  it("keeps scores within 0..1", () => {
    const r = recommend({ ...lean, mobility: "knee" });
    expect(r.confidence_score).toBeGreaterThanOrEqual(0);
    expect(r.confidence_score).toBeLessThanOrEqual(1);
    expect(r.upsell_score).toBeLessThanOrEqual(1);
  });
});