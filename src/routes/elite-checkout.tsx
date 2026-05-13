import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { SiteShell } from "@/components/site/SiteShell";
import { initPaystackTransaction } from "@/server/paystack.functions";
import { productBySku, formatNGN } from "@/lib/catalog";
import { pageMeta } from "@/lib/site-meta";

const SKU = "RES-ELITE-ACCESS";

export const Route = createFileRoute("/elite-checkout")({
  head: () => ({
    meta: pageMeta({
      title: "Elite Access — Checkout",
      description: "Unlock ResoFlex Elite Access. Pay securely in Naira via Paystack.",
    }),
  }),
  component: EliteCheckout,
});

const FormSchema = z.object({
  email: z.string().trim().email({ message: "Enter a valid email" }).max(320),
  name: z.string().trim().min(2, { message: "Enter your full name" }).max(120),
});

function EliteCheckout() {
  const product = productBySku(SKU)!;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    const parsed = FormSchema.safeParse({ email, name });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    try {
      const res = await initPaystackTransaction({
        data: { email: parsed.data.email, name: parsed.data.name, items: [{ sku: SKU, quantity: 1 }] },
      });
      if (!res.ok) {
        toast.error(res.error || "Could not initialize transaction");
        setLoading(false);
        return;
      }
      toast.success("Redirecting to Paystack…");
      window.location.href = res.authorization_url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setLoading(false);
    }
  }

  return (
    <SiteShell>
      <section className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-16 pb-24">
        {/* Brushed steel ambience */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, #E5E4E2 0 1px, transparent 1px 3px), radial-gradient(circle at 30% 20%, #D4AF37 0%, transparent 45%)",
          }}
        />

        <header className="text-center">
          <div className="text-[10px] tracking-[0.5em] uppercase text-[#D4AF37]">Sovereign Tier</div>
          <h1 className="mt-3 font-display text-5xl sm:text-6xl tracking-tight">
            <span className="bg-gradient-to-r from-[#D4AF37] via-[#F4EADE] to-[#D4AF37] bg-clip-text text-transparent">
              Elite Access
            </span>
          </h1>
          <p className="mt-3 text-sm text-[#E5E4E2]/70 max-w-md mx-auto">
            One payment. Lifetime authority. Pay securely in Naira.
          </p>
        </header>

        <div className="mt-12 grid lg:grid-cols-[1.1fr_1fr] gap-6">
          {/* Summary card — glassmorphism */}
          <div
            className="relative rounded-2xl p-8 border backdrop-blur-xl"
            style={{
              background: "linear-gradient(135deg, rgba(20,20,20,0.7), rgba(0,0,0,0.5))",
              borderColor: "rgba(212,175,55,0.35)",
              boxShadow: "0 30px 80px -30px rgba(212,175,55,0.25), inset 0 1px 0 rgba(229,228,226,0.08)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] tracking-[0.4em] uppercase text-[#D4AF37]">Product</div>
                <div className="font-display text-2xl mt-2 text-[#F4EADE]">{product.title}</div>
                <p className="text-sm text-[#E5E4E2]/60 mt-2 max-w-xs">{product.tagline}</p>
              </div>
              <span className="text-[10px] tracking-[0.3em] uppercase px-2 py-1 rounded-sm bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/40">
                {product.badge}
              </span>
            </div>

            <ul className="mt-6 space-y-2 text-sm text-[#E5E4E2]/80">
              {product.highlights.map((h) => (
                <li key={h} className="flex items-center gap-3">
                  <span className="h-1 w-6 bg-gradient-to-r from-[#D4AF37] to-transparent" />
                  {h}
                </li>
              ))}
            </ul>

            <div className="mt-8 pt-6 border-t border-[#E5E4E2]/10 flex items-baseline justify-between">
              <span className="text-xs tracking-[0.3em] uppercase text-[#E5E4E2]/60">Total</span>
              <span className="font-display text-4xl text-[#D4AF37]" style={{ textShadow: "0 0 30px rgba(212,175,55,0.3)" }}>
                {formatNGN(product.ngnMinor)}
              </span>
            </div>
          </div>

          {/* Form card */}
          <form
            onSubmit={handlePay}
            className="relative rounded-2xl p-8 border backdrop-blur-xl flex flex-col gap-5"
            style={{
              background: "linear-gradient(135deg, rgba(15,15,15,0.75), rgba(0,0,0,0.6))",
              borderColor: "rgba(229,228,226,0.12)",
            }}
          >
            <div>
              <label className="text-[10px] tracking-[0.4em] uppercase text-[#E5E4E2]/60">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Adunni Okafor"
                required
                disabled={loading}
                className="mt-2 w-full bg-black/40 border border-[#E5E4E2]/10 focus:border-[#D4AF37] focus:outline-none rounded-md px-4 py-3.5 text-[#F4EADE] placeholder:text-[#E5E4E2]/30 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.4em] uppercase text-[#E5E4E2]/60">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@empire.com"
                required
                disabled={loading}
                className="mt-2 w-full bg-black/40 border border-[#E5E4E2]/10 focus:border-[#D4AF37] focus:outline-none rounded-md px-4 py-3.5 text-[#F4EADE] placeholder:text-[#E5E4E2]/30 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="relative mt-2 w-full overflow-hidden rounded-md py-4 text-sm font-semibold tracking-[0.25em] uppercase text-black transition-transform active:scale-[0.99] disabled:opacity-80 disabled:cursor-wait"
              style={{
                background: loading
                  ? "linear-gradient(110deg, #B8941F 30%, #F4EADE 50%, #B8941F 70%)"
                  : "linear-gradient(135deg, #D4AF37, #F4EADE 50%, #D4AF37)",
                backgroundSize: loading ? "300% 100%" : "100% 100%",
                animation: loading ? "shimmer 1.6s linear infinite" : undefined,
                boxShadow: "0 10px 40px -10px rgba(212,175,55,0.55)",
              }}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Initializing…
                </span>
              ) : (
                <>Pay {formatNGN(product.ngnMinor)} Now</>
              )}
            </button>

            <p className="text-[10px] text-center tracking-[0.3em] uppercase text-[#E5E4E2]/40">
              Secured by Paystack · 256-bit TLS
            </p>
          </form>
        </div>
      </section>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </SiteShell>
  );
}