// Nigerian e-commerce trust badges. Reuses existing tokens/styles.

const BADGES = [
  { icon: "🔒", t: "Secured Instant Bank Transfer / Card Payment via Paystack" },
  { icon: "🚚", t: "24–48 Hour Insured Delivery to Lagos & Abuja" },
  { icon: "💬", t: "Real-Time Tracking & WhatsApp Support Available" },
  { icon: "🛡️", t: "100% Premium Industrial Guarantee" },
] as const;

export function NigerianEcommerceTrustCheck({ className = "" }: { className?: string }) {
  return (
    <ul className={`grid sm:grid-cols-2 gap-2 max-w-2xl ${className}`}>
      {BADGES.map((b) => (
        <li
          key={b.t}
          className="flex items-start gap-2 rounded-sm border border-[var(--glass-border)] bg-[var(--ink)]/40 px-3 py-2 text-xs text-foreground/85"
        >
          <span aria-hidden className="text-base leading-none">
            {b.icon}
          </span>
          <span className="leading-snug">{b.t}</span>
        </li>
      ))}
    </ul>
  );
}