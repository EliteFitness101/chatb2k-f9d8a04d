/**
 * Cover-image URL allowlist for BIGO media rehosting.
 * Keep this separate from the video Blob allowlist: Vercel Blob cover assets
 * are image files and must never be accepted as video sources.
 */
export function allowedBlobCover(url: string): boolean {
  try {
    const u = new URL(url);
    const allowedPath =
      u.pathname.startsWith("/buffer/assets/bigo_highlights/") ||
      u.pathname.startsWith("/bigo_highlights/");
    return (
      u.protocol === "https:" &&
      u.hostname === "ab2ttlkn9no0tuoa.public.blob.vercel-storage.com" &&
      allowedPath &&
      /\.(jpg|jpeg|png|webp)$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}
