import { Link } from "@tanstack/react-router";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "h-10" : size === "sm" ? "h-6" : "h-8";
  return (
    <Link
      to="/"
      className="group inline-flex items-center gap-2.5"
      aria-label="ResoFlex home"
    >
      <span
        className={`${dim} aspect-square rounded-sm bg-gold-gradient grid place-items-center shadow-gold transition-transform group-hover:scale-105`}
      >
        <span className="font-display text-[var(--ink)] font-bold text-sm leading-none">
          R
        </span>
      </span>
      <span className="font-display text-lg tracking-wide">
        ResoFlex<span className="text-gold">™</span>
      </span>
    </Link>
  );
}