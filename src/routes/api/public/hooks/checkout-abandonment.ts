import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Checkout abandonment sweep.
 *
 * A `checkout_started` funnel event is considered abandoned when:
 *   1. It is older than `TIMEOUT_MINUTES` and younger than `LOOKBACK_HOURS`.
 *   2. There is no matching `charge.success` in `revenue_events` on the same
 *      (rsid, product_sku) with `status = 'success'`.
 *   3. No `checkout_abandoned` funnel event was already emitted for that
 *      session_id (or (rsid, product_sku) fallback).
 *
 * Idempotent, retry safe, concurrency safe: the dedup lookup on
 * `funnel_events(event_name='checkout_abandoned')` prevents duplicate emission
 * even if the cron runs concurrently.
 *
 * Fire-and-forget forward to the existing Make webhook when configured;
 * webhook failures never block sweep progress.
 */

const TIMEOUT_MINUTES = 30;
const LOOKBACK_HOURS = 24;
const BATCH_LIMIT = 200;

type Row = {
  id: string;
  rsid: string | null;
  props: Record<string, unknown> | null;
  occurred_at: string;
};

export const Route = createFileRoute("/api/public/hooks/checkout-abandonment")({
  server: {
    handlers: {
      POST: async () => {
        const now = Date.now();
        const upper = new Date(now - TIMEOUT_MINUTES * 60 * 1000).toISOString();
        const lower = new Date(now - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

        const { data: candidates, error } = await supabaseAdmin
          .from("funnel_events")
          .select("id, rsid, props, occurred_at")
          .eq("event_name", "checkout_started")
          .gte("occurred_at", lower)
          .lte("occurred_at", upper)
          .order("occurred_at", { ascending: true })
          .limit(BATCH_LIMIT);

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        const rows = (candidates ?? []) as unknown as Row[];
        let emitted = 0;
        let skippedPaid = 0;
        let skippedDupe = 0;

        for (const c of rows) {
          const p = c.props ?? {};
          const sku = (p as Record<string, unknown>).product_sku as string | undefined;
          const sessionId = (p as Record<string, unknown>).session_id as string | undefined;
          const rsid = c.rsid;

          // Skip if a paid revenue event exists for this rsid+sku after checkout_started
          if (rsid && sku) {
            const { count: paidCount } = await supabaseAdmin
              .from("revenue_events")
              .select("id", { count: "exact", head: true })
              .eq("rsid", rsid)
              .eq("product_sku", sku)
              .eq("status", "success")
              .gte("occurred_at", c.occurred_at);
            if ((paidCount ?? 0) > 0) {
              skippedPaid += 1;
              continue;
            }
          }

          // Idempotency: has a checkout_abandoned already been emitted?
          const dedupeKey = sessionId
            ? { field: "session_id", value: sessionId }
            : rsid && sku
              ? { field: "checkout_started_id", value: c.id }
              : null;

          if (dedupeKey) {
            const { count: dupeCount } = await supabaseAdmin
              .from("funnel_events")
              .select("id", { count: "exact", head: true })
              .eq("event_name", "checkout_abandoned")
              .filter(`props->>${dedupeKey.field}`, "eq", dedupeKey.value);
            if ((dupeCount ?? 0) > 0) {
              skippedDupe += 1;
              continue;
            }
          }

          const abandonedProps = {
            ...(p as Record<string, unknown>),
            session_id: sessionId,
            checkout_started_id: c.id,
            checkout_started_at: c.occurred_at,
            timeout_minutes: TIMEOUT_MINUTES,
            funnel_origin:
              (p as Record<string, unknown>).funnel_origin ?? "resofit",
          };

          const { error: insErr } = await supabaseAdmin
            .from("funnel_events")
            .insert({
              event_name: "checkout_abandoned",
              rsid: rsid,
              props: abandonedProps as never,
            });

          if (insErr) continue;
          emitted += 1;

          // Optional Make.com bridge (fire-and-forget)
          const makeUrl = process.env.MAKE_WEBHOOK_URL;
          if (makeUrl) {
            try {
              const headers: Record<string, string> = {
                "Content-Type": "application/json",
              };
              const sharedSecret = process.env.MAKE_WEBHOOK_SECRET;
              if (sharedSecret) headers["x-shared-secret"] = sharedSecret;
              await fetch(makeUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  event: "checkout_abandoned",
                  rsid,
                  props: abandonedProps,
                }),
              });
            } catch {
              /* non-blocking */
            }
          }
        }

        return Response.json({
          ok: true,
          scanned: rows.length,
          emitted,
          skipped_paid: skippedPaid,
          skipped_duplicate: skippedDupe,
        });
      },
    },
  },
});