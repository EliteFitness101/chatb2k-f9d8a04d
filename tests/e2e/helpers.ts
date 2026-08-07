import { createHmac } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";

export const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:8080";

/** Unique per-run reference so repeated runs never collide on idempotency keys. */
export function testReference(prefix = "E2E") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function paystackSignature(raw: string) {
  const secret = process.env["PAYSTACK_SECRET_KEY"] ?? "";
  return createHmac("sha512", secret).update(raw).digest("hex");
}

/** Restore the sandbox-injected Supabase session so authenticated routes render. */
export async function restoreSupabaseSession(context: BrowserContext, page: Page) {
  const storageKey = process.env["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"];
  const sessionJson = process.env["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"];
  const cookiesJson = process.env["LOVABLE_BROWSER_SUPABASE_COOKIES_JSON"];
  if (!storageKey || !sessionJson) return false;

  if (cookiesJson) {
    const cookies = (JSON.parse(cookiesJson) as Record<string, unknown>[]).map((c) => ({
      ...c,
      url: BASE_URL,
    }));
    await context.addCookies(cookies as never);
  }
  await page.goto("/");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [storageKey, sessionJson] as const,
  );
  return true;
}

export const hasSupabaseSession = () =>
  Boolean(
    process.env["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"] &&
      process.env["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"],
  );