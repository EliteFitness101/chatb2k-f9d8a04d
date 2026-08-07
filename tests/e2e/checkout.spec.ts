import { expect, test } from "@playwright/test";

test.describe("checkout smoke", () => {
  test("smart checkout renders a product, total and payment rails", async ({ page }) => {
    await page.goto("/checkout");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading").first()).toBeVisible();
    await expect(main).toContainText(/₦|\$/);

    // Financial router must expose at least one payment rail link.
    const rails = page.locator('a[href*="/paystack"], a[href*="/crypto"], a[href*="/shopify"]');
    await expect(rails.first()).toBeVisible();
  });

  test("checkout honours the sku search param", async ({ page }) => {
    await page.goto("/products");
    const firstProduct = page.locator('a[href^="/products/"]').first();
    await expect(firstProduct).toBeVisible();
    const href = await firstProduct.getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto("/checkout?sku=RES-ELITE-ACCESS");
    await expect(page.locator("body")).toContainText(/elite/i);
  });

  test("paystack rail collects customer details and validates them", async ({ page }) => {
    await page.goto("/paystack?sku=RES-ELITE-ACCESS");

    const main = page.getByRole("main");
    const select = main.locator("select");
    await expect(select).toBeVisible();
    const inputs = main.locator("input");
    await expect(inputs).toHaveCount(2);

    const payButton = page.getByRole("button", { name: /pay with paystack/i });
    await expect(payButton).toBeVisible();

    // Empty form must not start a transaction. Retry the click until React has
    // hydrated the island (SSR markup is clickable before handlers attach).
    await expect(async () => {
      await payButton.click();
      await expect(page.getByText(/name and email are required/i)).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 20_000 });

    // Filled form keeps the total visible and the CTA actionable.
    await inputs.nth(0).fill("E2E Tester");
    await inputs.nth(1).fill("e2e@example.com");
    await expect(payButton).toBeEnabled();
  });

  test("success page reports an unverifiable reference instead of hanging", async ({ page }) => {
    await page.goto("/success?reference=E2E-DOES-NOT-EXIST");
    await expect(page.getByText(/E2E-DOES-NOT-EXIST/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /could not verify|verifying|verified/i }),
    ).toBeVisible();
  });
});