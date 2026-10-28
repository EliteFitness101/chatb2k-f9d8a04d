import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import CoachB2KAssist from "@/components/CoachB2KAssist";
import "@/lib/i18n";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 ember-bg">
      <div className="max-w-md text-center glass rounded-md p-10">
        <div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">404</div>
        <h2 className="font-display text-4xl text-foreground">Route not found.</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          This ChatB2K route does not exist. Return to ChatB2K.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-sm bg-gold-gradient px-5 py-2.5 text-sm font-semibold text-[var(--ink)]"
          >
            Return to ChatB2K
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ChatB2K — ResoFit Intelligence" },
      {
        name: "description",
        content:
          "ChatB2K by ResoFit: governed AI orchestration for wellness, commerce, content, media and ecosystem operations.",
      },
      { name: "author", content: "ResoFit" },
      { name: "application-name", content: "ChatB2K" },
      { name: "theme-color", content: "#0A0A0A" },
      { property: "og:title", content: "ChatB2K — ResoFit Intelligence" },
      {
        property: "og:description",
        content:
          "Governed AI orchestration for ResoFit wellness, commerce, content, media and ecosystem operations.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "ChatB2K" },
      { property: "og:url", content: "https://chatb2k.resofit.fit/" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@resofit" },
      { name: "twitter:creator", content: "@resofit" },
      { name: "twitter:title", content: "ChatB2K — ResoFit Intelligence" },
      {
        name: "twitter:description",
        content:
          "Governed AI orchestration for ResoFit wellness, commerce, content, media and ecosystem operations.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://www.resofit.fit/#organization",
              name: "ResoFit",
              alternateName: ["Resonance Fitness", "ChatB2K"],
              url: "https://www.resofit.fit",
            },
            {
              "@type": "WebSite",
              "@id": "https://chatb2k.resofit.fit/#website",
              url: "https://chatb2k.resofit.fit/",
              name: "ChatB2K",
              publisher: { "@id": "https://www.resofit.fit/#organization" },
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
