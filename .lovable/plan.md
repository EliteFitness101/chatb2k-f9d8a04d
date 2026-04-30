
# ResoFlex™ Global Sanctuary — Build Plan

A luxury, dark-glassmorphism fitness brand site with two live checkout rails: **Shopify** for international buyers and **Paystack** for Nigerian buyers. A smart `/checkout` page picks the rail based on visitor IP, with dedicated `/shopify` and `/paystack` pages for direct ad linking. `/selar` and `/crypto` ship as "coming soon" placeholders so the URL structure exists without blocking launch.

## What gets built

### Pages (TanStack Start routes)
- `/` — Hero, brand promise, featured Apex Bundle, hub map preview, CTA to checkout
- `/products` — Full SKU grid: Cast Iron Sets (15–50kg), Elite Bench, Digital Protocols, Coaching, Apex Bundle
- `/products/$slug` — Product detail: gallery, specs, price (auto-currency), Add to Cart / Buy Now
- `/bundles` — Spotlight on the **Buchi Power Apex Bundle** (₦380,000) and tier comparison
- `/hubs` — Global HQ + National + International hub directory with addresses and "nearest hub" auto-highlight
- `/about` — Authority story, founder, methodology
- `/checkout` — **Smart router**: detects IP → defaults to Paystack (NG) or Shopify (intl), with manual rail switcher
- `/shopify` — Dedicated international checkout entry (USD/GBP/EUR via Shopify)
- `/paystack` — Dedicated Nigerian checkout entry (NGN via Paystack inline)
- `/selar` — "Coming soon" placeholder
- `/crypto` — "Coming soon" placeholder (USDT/BTC for ₦380k+ bundles)
- `/success` — Post-payment confirmation with order ref + assigned fulfillment hub
- Each route gets unique `head()` metadata (title, description, og tags)

### Visual system
- Background `#0A0A0A`, gold accent `#D4AF37`, frosted-glass cards (backdrop-blur + subtle gold borders)
- Inter for body, a serif display face for headings (luxury editorial feel)
- Subtle gold gradient washes, animated ember/glow accents on hero, smooth scroll reveals
- All shadcn components retuned to the dark/gold theme via CSS tokens in `styles.css`

### Checkout & payments
- **Shopify** — Standard Shopify integration (you'll be prompted to create or connect a store). Product catalog, cart, and Shopify-hosted checkout handle international payments, tax, and shipping.
- **Paystack** — Inline popup checkout in NGN. Server function creates a transaction reference; webhook at `/api/public/paystack-webhook` verifies signature and records the order.
- **Auto-currency routing** — Server function reads visitor IP headers, geolocates country, sets default currency (NGN for NG, USD/GBP/EUR otherwise), and assigns the nearest fulfillment hub for display.
- **Mechanical Necessity Upsell** — After a successful iron purchase, success page shows a 5-second "Verifying authority…" animation, then a one-tap upsell card for the Elite Bench or App Plus.

### Backend (Lovable Cloud)
- Tables: `products`, `orders`, `order_items`, `hubs`, `upsell_events`
- Order records store rail (shopify/paystack), currency, assigned hub, status
- Webhook endpoints under `/api/public/*` with HMAC signature verification

### Secrets needed (you'll be asked for these after approval)
- `PAYSTACK_SECRET_KEY` — server-side, for transaction init + webhook verification
- `PAYSTACK_PUBLIC_KEY` — public, for inline popup
- Shopify is connected via the Shopify integration (no manual keys)

## Out of scope for v1 (can add later)
- PayPal / Stripe / Apple Pay direct rails (Shopify covers these via its checkout)
- Selar integration (placeholder page only)
- Crypto / USDT / BTC checkout (placeholder page only)
- Coaching subscription billing portal
- Real-time IP→hub map animation (static "nearest hub" badge in v1)
- Admin dashboard for order management (use Shopify admin + Cloud table view)

## Notes on your brief
- **Hosting**: Building on TanStack Start, deployed via Lovable (not Vercel/Next). Custom domain `resofit.fit` connects after first publish. The env vars in your brief are reframed as Lovable Cloud secrets and Shopify connection.
- **`/shopify` and `/paystack` as routes**: These exist as direct entry points (good for ad campaigns), and `/checkout` is the smart default that picks for the visitor.
- **Crypto + Selar**: Shipping as URL placeholders so links don't 404 and you can wire them in a follow-up pass without restructuring.

After you approve, I'll enable Lovable Cloud + Shopify, request the Paystack keys, then build the site top-to-bottom.
