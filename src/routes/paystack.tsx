import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { products, productBySku, formatNGN } from "@/lib/catalog";
import { initPaystackTransaction } from "@/server/paystack.functions";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/paystack")({
  validateSearch: (s) => z.object({ sku: z.string().optional() }).parse(s),
  head: () => ({
    meta: pageMeta({ title: "Paystack Checkout", description: "Pay in Nigerian Naira via Paystack." }),
  }),
  component: PaystackPage,
});

declare global { interface Window { PaystackPop?: { setup: (opts: Record<string, unknown>) => { openIframe: () => void } } } }

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.PaystackPop) return resolve();
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Paystack"));
    document.head.appendChild(s);
  });
}

function PaystackPage() {
  const { sku } = Route.useSearch();
  const navigate = useNavigate();
  const [selectedSku, setSelectedSku] = useState(sku ?? products[0].sku);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const product = productBySku(selectedSku) ?? products[0];

  async function pay() {
    setErr(null);
    if (!name || !email) { setErr("Name and email are required."); return; }
    setLoading(true);
    try {
      const res = await initPaystackTransaction({ data: { email, name, items: [{ sku: product.sku, quantity: 1 }] } });
      if (!res.ok) { setErr(res.error); setLoading(false); return; }
      await loadPaystackScript();
      if (!window.PaystackPop || !res.publicKey) {
        // Fallback: redirect to Paystack hosted page
        window.location.href = res.authorization_url;
        return;
      }
      const handler = window.PaystackPop.setup({
        key: res.publicKey,
        email,
        amount: res.amount,
        currency: "NGN",
        ref: res.reference,
        onClose: () => setLoading(false),
        callback: () => {
          navigate({ to: "/success", search: { reference: res.reference } });
        },
      });
      handler.openIframe();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Checkout failed");
      setLoading(false);
    }
  }

  return (
    <SiteShell>
      <section className="mx-auto max-w-2xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading eyebrow="Rail · Paystack" title="Pay in Naira." sub="Inline secure checkout via Paystack. NGN only." />
        <div className="mt-10 glass rounded-md p-8 space-y-5">
          <div>
            <label className="text-xs tracking-widest uppercase text-muted-foreground">Product</label>
            <select value={selectedSku} onChange={(e) => setSelectedSku(e.target.value)} className="mt-2 w-full bg-[var(--ink)] border border-[var(--glass-border)] rounded-sm px-4 py-3 text-foreground">
              {products.map((p) => (
                <option key={p.sku} value={p.sku}>{p.title} — {formatNGN(p.ngnMinor)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs tracking-widest uppercase text-muted-foreground">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full bg-[var(--ink)] border border-[var(--glass-border)] rounded-sm px-4 py-3" />
          </div>
          <div>
            <label className="text-xs tracking-widest uppercase text-muted-foreground">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full bg-[var(--ink)] border border-[var(--glass-border)] rounded-sm px-4 py-3" />
          </div>
          <div className="flex items-baseline justify-between pt-2 border-t border-[var(--glass-border)]">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-display text-3xl text-gold-gradient">{formatNGN(product.ngnMinor)}</span>
          </div>
          {err && <div className="text-sm text-destructive">{err}</div>}
          <button onClick={pay} disabled={loading} className="w-full px-6 py-4 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold disabled:opacity-60">
            {loading ? "Verifying…" : "Pay with Paystack"}
          </button>
          <p className="text-xs text-muted-foreground text-center">Secured by Paystack · Moniepoint, PalmPay, cards & bank transfer.</p>
        </div>
      </section>
    </SiteShell>
  );
}