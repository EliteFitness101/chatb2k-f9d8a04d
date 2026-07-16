import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import "@/lib/i18n";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 ember-bg">
      <div className="max-w-md text-center glass rounded-md p-10">
        <div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">404</div>
        <h2 className="font-display text-4xl text-foreground">Off the grid.</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          This sanctuary doesn't exist. Return to the global hub.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-sm bg-gold-gradient px-5 py-2.5 text-sm font-semibold text-[var(--ink)]"
          >
            Return home
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
      { title: "ResoFlex™ — The Global Mechanical Authority" },
      {
        name: "description",
        content:
          "ResoFlex™ Global Sanctuary. Cast iron, ancestral doctrine, and white-glove fulfilment from hubs in Nigeria, the United States and Canada.",
      },
      { name: "author", content: "ResoFlex" },
      { name: "theme-color", content: "#0A0A0A" },
      { property: "og:title", content: "ResoFlex™ — The Global Mechanical Authority" },
      { property: "og:description", content: "ResoFlex™ Global Sanctuary. Cast iron, ancestral doctrine, and white-glove fulfilment from hubs in Nigeria, the United States and Canada." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "ResoFlex™" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@resofit" },
      { name: "twitter:creator", content: "@resofit" },
      { name: "twitter:title", content: "ResoFlex™ — The Global Mechanical Authority" },
      { name: "twitter:description", content: "ResoFlex™ Global Sanctuary. Cast iron, ancestral doctrine, and white-glove fulfilment from hubs in Nigeria, the United States and Canada." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/6Eau1IDWDDhZUhfxU2V2gQiCmo03/social-images/social-1784203101188-resofit-hero-banner-neural-architekt.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/6Eau1IDWDDhZUhfxU2V2gQiCmo03/social-images/social-1784203101188-resofit-hero-banner-neural-architekt.webp" },
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
              "@id": "https://resoflex-global.lovable.app/#organization",
              name: "ResoFlex™",
              alternateName: "ResoFit",
              url: "https://resoflex-global.lovable.app",
              logo: "https://resoflex-global.lovable.app/logo.png",
              sameAs: [
                "https://reso-fit.lovable.app",
                "https://joy-funnel-ai.lovable.app",
              ],
            },
            {
              "@type": "Brand",
              "@id": "https://resoflex-global.lovable.app/#brand",
              name: "ResoFlex™",
              slogan: "The global mechanical authority.",
            },
            {
              "@type": "WebSite",
              "@id": "https://resoflex-global.lovable.app/#website",
              url: "https://resoflex-global.lovable.app",
              name: "ResoFlex™ Global Sanctuary",
              publisher: { "@id": "https://resoflex-global.lovable.app/#organization" },
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate:
                    "https://resoflex-global.lovable.app/products?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
              },
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
