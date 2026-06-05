import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Schema = z.object({
  event_name: z.string().min(1).max(64),
  rsid: z.string().max(64).optional().nullable(),
  props: z.record(z.string(), z.unknown()).optional(),
});

export const Route = createFileRoute("/api/public/funnel-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return new Response("Invalid", { status: 400 });

        const { event_name, rsid, props } = parsed.data;
        await supabaseAdmin.from("funnel_events").insert({
          event_name,
          rsid: rsid ?? null,
          props: (props ?? {}) as never,
        });
        return new Response("ok");
      },
    },
  },
});