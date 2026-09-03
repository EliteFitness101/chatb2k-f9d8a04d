import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({ query: z.string().trim().min(3).max(500) });

type FirecrawlSearchResult = { title?: string; url?: string; description?: string; markdown?: string };

const LIVE_WEB_HINTS = [
  "latest", "today", "current", "now", "recent", "price", "pricing", "available",
  "availability", "location", "near", "nearby", "address", "contact", "website", "email",
  "spa", "gym", "wellness hub", "clinic", "competitor", "partner", "brand deal", "news",
];

function shouldUseLiveWeb(query: string) {
  const normalized = query.toLowerCase();
  return LIVE_WEB_HINTS.some((hint) => normalized.includes(hint));
}

function cleanMarkdown(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").slice(0, 7000);
}

/** ChatB2K live-web sensing layer. Firecrawl stays server-side. */
export const queryFirecrawl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    if (!shouldUseLiveWeb(data.query)) return { used: false, query: data.query, sources: [] };

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.warn("[firecrawl] FIRECRAWL_API_KEY is not configured");
      return { used: false, query: data.query, sources: [], unavailable: true };
    }

    const response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: data.query, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error("[firecrawl] search failed", response.status);
      return { used: false, query: data.query, sources: [], error: "live_web_unavailable" };
    }

    const payload = (await response.json()) as { data?: { web?: FirecrawlSearchResult[] } };
    const retrievedAt = new Date().toISOString();
    const sources = (payload.data?.web ?? [])
      .filter((item) => typeof item.url === "string" && item.url.startsWith("http"))
      .map((item) => ({
        title: (item.title ?? "Untitled").slice(0, 300),
        url: item.url!,
        description: (item.description ?? "").slice(0, 1000),
        content: cleanMarkdown(item.markdown),
        retrieved_at: retrievedAt,
      }));

    return { used: true, query: data.query, sources };
  });
