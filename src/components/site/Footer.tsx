import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-32 border-t border-[var(--glass-border)] bg-[var(--ink-soft)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground leading-relaxed">
            ResoFlex™ is a global mechanical authority — physical iron, ancestral
            doctrine, and white-glove fulfilment from hubs in Nigeria, the United
            States and Canada.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Global HQ — Top Floor, Melrose Plaza, Umudike, Abia, Nigeria.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold tracking-widest text-gold uppercase">Catalogue</h4>
          <ul className="mt-4 space-y-2 text-sm text-foreground/80">
            <li><Link to="/products" className="hover:text-gold">Arsenal</Link></li>
            <li><Link to="/bundles" className="hover:text-gold">Apex Bundle</Link></li>
            <li><Link to="/hubs" className="hover:text-gold">Global Hubs</Link></li>
            <li><Link to="/about" className="hover:text-gold">Authority</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold tracking-widest text-gold uppercase">Pay</h4>
          <ul className="mt-4 space-y-2 text-sm text-foreground/80">
            <li><Link to="/checkout" className="hover:text-gold">Smart Checkout</Link></li>
            <li><Link to="/paystack" className="hover:text-gold">Paystack (NGN)</Link></li>
            <li><Link to="/shopify" className="hover:text-gold">Shopify (Global)</Link></li>
            <li><Link to="/crypto" className="hover:text-gold">Crypto</Link></li>
            <li><Link to="/selar" className="hover:text-gold">Selar</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--glass-border)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} ResoFlex™. All rights reserved.</span>
          <span className="tracking-widest uppercase">Buchi-Approved · Globally Verified</span>
        </div>
      </div>
    </footer>
  );
}