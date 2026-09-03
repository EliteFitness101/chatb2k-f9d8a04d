import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { FirecrawlQuerySchema, searchLiveWeb } from "@/lib/firecrawl.server";

export const Route = createFileRoute("/api/public/firecrawl")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice("Bearer ".length).trim();
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !publishableKey) return new Response("Server auth unavailable", { status: 500 });

        const supabase = createClient(supabaseUrl, publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
        if (claimsError || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });

        let body: unknown;
        try { body = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
        const parsed = FirecrawlQuerySchema.safeParse(body);
        if (!parsed.success) return new Response("Invalid query", { status: 400 });

        try {
          const result = await searchLiveWeb(parsed.data.query);
          return Response.json(result, { headers: { "Cache-Control": "private, max-age=30" } });
        } catch (error) {
          console.error("[firecrawl] request failed", error);
          return Response.json({ used: false, query: parsed.data.query, sources: [], error: "live_web_unavailable" }, { status: 200 });
        }
      },
    },
  },
});
