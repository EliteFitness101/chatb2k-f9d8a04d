export const SITE = {
  name: "ResoFlex™ Global Sanctuary",
  url: "https://resoflex-global.lovable.app",
  tagline: "The global mechanical authority.",
  twitterHandle: "@resofit",
  defaultImage:
    "https://storage.googleapis.com/gpt-engineer-file-uploads/hQQDiX5DKnSMb28ltdDE1ElIVX62/social-images/social-1777724930901-resofit-hero-banner-neural-architekt.webp",
};

export function pageMeta({
  title,
  description,
  image,
  url,
  type = "website",
}: {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: string;
}) {
  const fullTitle = `${title} — ResoFlex™`;
  const ogImage = image ?? SITE.defaultImage;
  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: description },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:site_name", content: "ResoFlex™" },
    { property: "og:locale", content: "en_US" },
    { property: "og:image", content: ogImage },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: SITE.twitterHandle },
    { name: "twitter:creator", content: SITE.twitterHandle },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
  ];
  if (url) {
    meta.push({ property: "og:url", content: url });
  }
  return meta;
}

/**
 * BreadcrumbList JSON-LD script entry — one per eligible page.
 * Pass absolute URLs; caller controls canonical structure.
 */
export function breadcrumbScript(
  items: Array<{ name: string; url: string }>,
) {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
        item: it.url,
      })),
    }),
  };
}

export function canonicalLink(url: string) {
  return { rel: "canonical", href: url };
}

export const SITE_URL = SITE.url;
