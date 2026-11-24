import { createFileRoute, Outlet, useNavigate, useLocation, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGuard,
});

function AuthGuard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: location.pathname } });
    }
  }, [loading, user, navigate, location.pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-5">
        <div className="text-center">
          <div className="text-xs tracking-[0.3em] uppercase text-gold animate-pulse">Authorizing…</div>
          <p className="mt-3 text-sm text-muted-foreground">Sign in to continue to this workspace.</p>
          <Link
            to="/login"
            search={{ redirect: location.pathname }}
            className="inline-flex mt-5 rounded-full bg-gold-gradient px-5 py-3 text-sm font-semibold text-[var(--ink)]"
          >
            Continue to sign in
          </Link>
          <Link to="/" className="block mt-4 text-xs text-muted-foreground hover:text-gold">Return to ChatB2K</Link>
        </div>
      </div>
    );
  }
  return <Outlet />;
}