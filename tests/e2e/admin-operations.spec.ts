import { expect, test } from "@playwright/test";
import { hasSupabaseSession, restoreSupabaseSession } from "./helpers";

const ADMIN_ROUTES = [
  { path: "/admin", label: /global overview|command center/i },
  { path: "/admin/revenue", label: /revenue/i },
  { path: "/admin/orders", label: /order/i },
  { path: "/admin/payments", label: /payment/i },
  { path: "/admin/inventory", label: /inventory/i },
  { path: "/admin/fulfillment", label: /hub|fulfil/i },
  { path: "/admin/operations", label: /task|sla|operations/i },
  { path: "/admin/customers", label: /customer/i },
  { path: "/admin/chatb2k", label: /chatb2k|assessment/i },
  { path: "/admin/compliance", label: /audit|compliance/i },
];

test.describe("admin & operations dashboard", () => {
  test("unauthenticated visitors are redirected to login", async ({ page }) => {
    await page.goto("/admin/operations");
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    expect(page.url()).toContain("/login");
    expect(decodeURIComponent(page.url())).toContain("/admin/operations");
  });

  test.describe("authenticated console", () => {
    test.skip(!hasSupabaseSession(), "no Supabase session injected — sign in via the preview");

    test.beforeEach(async ({ context, page }) => {
      await restoreSupabaseSession(context, page);
    });

    test("command center renders its domain navigation", async ({ page }) => {
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: /command center/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /operations/i })).toBeVisible();
    });

    test("every admin domain route loads without a crash", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      for (const route of ADMIN_ROUTES) {
        await page.goto(route.path);
        await expect(page.getByRole("heading", { name: /command center/i })).toBeVisible();
        await expect(page.locator("body")).not.toContainText(/authorizing…/i);
        await expect(page.locator("body")).toContainText(route.label);
      }

      expect(errors, `page errors: ${errors.join(" | ")}`).toHaveLength(0);
    });

    test("operations dashboard exposes tasks and SLA surfaces", async ({ page }) => {
      await page.goto("/admin/operations");
      await expect(page.locator("body")).toContainText(/task/i);
      await expect(page.locator("body")).toContainText(/sla/i);
    });

    test("navigating between domains keeps the shell mounted", async ({ page }) => {
      await page.goto("/admin");
      await page.getByRole("link", { name: /^orders$/i }).click();
      await page.waitForURL(/\/admin\/orders/);
      await page.getByRole("link", { name: /operations/i }).click();
      await page.waitForURL(/\/admin\/operations/);
      await expect(page.getByRole("heading", { name: /command center/i })).toBeVisible();
    });
  });
});