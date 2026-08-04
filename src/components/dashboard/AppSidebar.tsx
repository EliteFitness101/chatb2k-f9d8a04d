import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Sparkles, Film, TrendingUp, ShieldCheck } from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/candy", label: "Candy Generator", icon: Sparkles },
  { to: "/content-engine", label: "Content Engine", icon: Film },
  { to: "/admin/revenue", label: "Growth Metrics", icon: TrendingUp },
  { to: "/admin", label: "Command Center", icon: ShieldCheck },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-[var(--glass-border)] bg-[var(--ink-soft)]/40 backdrop-blur-xl">
      <div className="px-6 py-6 border-b border-[var(--glass-border)]">
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">ResoFlex</div>
        <div className="font-display text-xl text-gold-gradient mt-1">Command Deck</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((n) => {
          const active = pathname === n.to || pathname.startsWith(n.to + "/");
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`group flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-all ${
                active
                  ? "bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold"
                  : "text-foreground/70 hover:text-gold hover:bg-[var(--ink)]/60"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "" : "opacity-70 group-hover:opacity-100"}`} />
              <span className="tracking-wide">{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-5 border-t border-[var(--glass-border)] text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
        Phase 01 · Noir Build
      </div>
    </aside>
  );
}