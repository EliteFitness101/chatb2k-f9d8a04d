import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { CurrencyBadge } from "./CurrencyBadge";

const NAV = [
  { to: "/products", key: "nav.arsenal" },
  { to: "/bundles", key: "nav.bundles" },
  { to: "/programs", key: "nav.programs" },
  { to: "/elite", key: "nav.elite" },
  { to: "/chatb2k", key: "nav.chatb2k" },
  { to: "/quiz", key: "nav.quiz" },
  { to: "/hubs", key: "nav.hubs" },
  { to: "/about", key: "nav.about" },
] as const;

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all ${
        scrolled ? "glass shadow-deep" : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-foreground/80 hover:text-gold transition-colors"
              activeProps={{ className: "text-gold" }}
            >
              {t(n.key)}
            </Link>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <CurrencyBadge />
          <LanguageSwitcher />
          {user ? (
            <Link to="/dashboard" className="text-sm text-foreground/80 hover:text-gold">{t("cta.dashboard")}</Link>
          ) : (
            <Link to="/login" className="text-sm text-foreground/80 hover:text-gold">{t("cta.signin")}</Link>
          )}
          <Link
            to="/checkout"
            className="px-5 py-2 rounded-sm bg-gold-gradient text-[var(--ink)] text-sm font-semibold tracking-wide hover:shadow-gold transition-shadow"
          >
            {t("cta.checkout")}
          </Link>
        </div>
        <button
          className="md:hidden text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="md:hidden glass border-t border-[var(--glass-border)]">
          <div className="px-4 py-4 flex flex-col gap-3 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="py-2 text-foreground/80"
                activeProps={{ className: "text-gold" }}
              >
                {t(n.key)}
              </Link>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--glass-border)]">
              <CurrencyBadge />
              <LanguageSwitcher />
            </div>
            <Link
              to="/checkout"
              onClick={() => setOpen(false)}
              className="mt-2 px-5 py-2.5 rounded-sm bg-gold-gradient text-[var(--ink)] text-center font-semibold"
            >
              {t("cta.checkout")}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}