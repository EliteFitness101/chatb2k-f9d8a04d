import { allowedBlobCover } from "./cover-source.ts";

Deno.test("accepts allowlisted Vercel Blob BIGO cover images", () => {
  const url = "https://ab2ttlkn9no0tuoa.public.blob.vercel-storage.com/buffer/assets/bigo_highlights/covers/sample.jpg";
  if (!allowedBlobCover(url)) throw new Error("Expected approved BIGO cover URL to pass");
});

Deno.test("accepts supported image extensions only", () => {
  const base = "https://ab2ttlkn9no0tuoa.public.blob.vercel-storage.com/bigo_highlights/covers/sample";
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    if (!allowedBlobCover(base + ext)) throw new Error(`Expected ${ext} to pass`);
  }
  if (allowedBlobCover(base + ".mp4")) throw new Error("Video extension must not pass cover allowlist");
});

Deno.test("rejects untrusted hosts and paths", () => {
  if (allowedBlobCover("https://attacker.example/bigo_highlights/cover.jpg")) throw new Error("Untrusted host passed");
  if (allowedBlobCover("https://ab2ttlkn9no0tuoa.public.blob.vercel-storage.com/other/cover.jpg")) throw new Error("Unapproved path passed");
  if (allowedBlobCover("http://ab2ttlkn9no0tuoa.public.blob.vercel-storage.com/bigo_highlights/cover.jpg")) throw new Error("HTTP URL passed");
});
