export const SITE = {
  name: "ResoFlex™ Global Sanctuary",
  url: "https://resofit.fit",
  tagline: "The global mechanical authority.",
};

export function pageMeta({ title, description }: { title: string; description: string }) {
  const fullTitle = `${title} — ResoFlex™`;
  return [
    { title: fullTitle },
    { name: "description", content: description },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}
