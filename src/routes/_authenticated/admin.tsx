import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { SiteShell } from "@/components/site/SiteShell";
import { ADMIN_DOMAINS } from "@/lib/rbac";
import { getAdminCapabilities } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Command Center — ResoFlex Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchCaps = useServerFn(getAdminCapabilities);
  const { data } = useQuery({
    queryKey: ["admin-capabilities"],
    queryFn: () => fetchCaps(),
    staleTime: 60_000,
  });

  const permissions = data?.permissions ?? [];
  const visible = ADMIN_DOMAINS.filter(
    (d) => permissions.length === 0 || permissions.includes(d.permission),
  );

  return (
    <SiteShell>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-10 pb-20">
        <header className="mb-8">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
            ResoFlex Enterprise
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-gold-gradient mt-1">
            Command Center
          </h1>
          <p className="text-xs text-muted-foreground mt-2">
            {data?.legacyAdmin
              ? "Super administrator · full capability set"
              : data?.roles?.length
                ? `Roles: ${data.roles.join(", ").replace(/_/g, " ")}`
                : "Capability-scoped operations console"}
          </p>
        </header>

        <nav className="flex flex-wrap gap-2 mb-8 border-b border-[var(--glass-border)] pb-4">
          {visible.map((d) => {
            const active = d.to === "/admin" ? pathname === "/admin" : pathname.startsWith(d.to);
            return (
              <Link
                key={d.key}
                to={d.to}
                className={`rounded-sm px-3 py-2 text-[11px] tracking-[0.2em] uppercase transition-colors ${
                  active
                    ? "bg-gold-gradient text-[var(--ink)] font-semibold"
                    : "border border-[var(--glass-border)] text-foreground/70 hover:text-gold"
                }`}
              >
                {d.label}
              </Link>
            );
          })}
        </nav>

        <Outlet />
      </div>
    </SiteShell>
  );
}