import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SiteShell } from "@/components/site/SiteShell";
import { verifyPaystackTransaction } from "@/server/paystack.functions";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/success")({
  validateSearch: (s) => z.object({ reference: z.string().optional() }).parse(s),
  head: () => ({
    meta: pageMeta({ title: "Verified", description: "Order verified by ResoFlex." }),
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const { reference } = Route.useSearch();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"verifying" | "paid" | "failed">("verifying");

  useEffect(() => {
    const timer = setInterval(() => setProgress((p) => Math.min(100, p + 4)), 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!reference) {
      setStatus("paid"); // generic success (non-paystack rails)
      return;
    }
    verifyPaystackTransaction({ data: { reference } })
      .then((r) => {
        if (r.ok && r.status === "paid") setStatus("paid");
        else setStatus("failed");
      })
      .catch(() => setStatus("failed"));
  }, [reference]);

  return (
    <SiteShell>
      <section className="mx-auto max-w-2xl px-4 sm:px-6 pt-16 pb-24 text-center">
        <div className="text-xs tracking-[0.4em] text-gold uppercase">Verification</div>
        <h1 className="mt-4 font-display text-5xl">
          {status === "verifying" && "Verifying authority…"}
          {status === "paid" && "Verified. Welcome to ResoFlex™."}
          {status === "failed" && "We could not verify your transaction."}
        </h1>

        <div className="mt-10 h-1.5 w-full bg-[var(--ink-soft)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gold-gradient transition-all duration-200"
            style={{ width: `${status === "paid" ? 100 : status === "failed" ? 100 : progress}%` }}
          />
        </div>

        {reference && (
          <p className="mt-6 text-xs text-muted-foreground tracking-widest uppercase">
            Reference · {reference}
          </p>
        )}

        {status === "paid" && (
          <div className="mt-12 glass rounded-md p-8 text-left">
            <div className="text-xs uppercase tracking-widest text-gold">Mechanical Necessity</div>
            <h2 className="font-display text-2xl mt-2">Complete the sanctuary.</h2>
            <p className="mt-2 text-muted-foreground text-sm">
              Your order has been routed to the nearest hub. Pair it with the
              Elite Bench or the 90-Day Protocol for the full doctrine.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/products" className="px-5 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold">View Arsenal</Link>
              <Link to="/bundles" className="px-5 py-3 rounded-sm glass">Apex Bundle →</Link>
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="mt-10">
            <Link to="/checkout" className="px-5 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold">Retry checkout</Link>
          </div>
        )}
      </section>
    </SiteShell>
  );
}