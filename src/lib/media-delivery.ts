export type MediaDelivery = {
  masterUrl: string;
  deliveryUrl: string;
  mode: "cloudflare" | "master";
};

function cloudflareTransformUrl(base: string, sourceUrl: string, options = "mode=video,width=1080,height=1920,fit=scale-down") {
  return base.replace(/\/$/, "") + "/cdn-cgi/media/" + options + "/" + sourceUrl;
}

export function getMediaDelivery(masterUrl: string): MediaDelivery {
  const base = process.env.CLOUDFLARE_MEDIA_BASE_URL?.trim();
  if (!base) return { masterUrl, deliveryUrl: masterUrl, mode: "master" };
  return { masterUrl, deliveryUrl: cloudflareTransformUrl(base, masterUrl), mode: "cloudflare" };
}
