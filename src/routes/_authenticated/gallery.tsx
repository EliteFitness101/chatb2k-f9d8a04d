import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { pageMeta } from "@/lib/site-meta";
import { ArrowDown, ArrowUp, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/gallery")({
  head: () => ({
    meta: pageMeta({
      title: "Site Gallery — Admin",
      description: "Upload, preview and reorder images used across the site.",
    }),
  }),
  component: GalleryAdminPage,
});

interface GalleryImage {
  id: string;
  label: string;
  slot: string;
  url: string;
  storage_path: string | null;
  sort_order: number;
}

const SLOTS = ["hero", "products", "content", "general"] as const;

function GalleryAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [items, setItems] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [slot, setSlot] = useState<(typeof SLOTS)[number]>("general");
  const [label, setLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Role check
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user, authLoading]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gallery_images")
      .select("id,label,slot,url,storage_path,sort_order")
      .order("slot", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as GalleryImage[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Client-side downscale (optimised upload) — max 1920px, JPEG q=0.85
  async function optimiseImage(file: File): Promise<Blob> {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
    const img = document.createElement("img");
    const url = URL.createObjectURL(file);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    const MAX = 1920;
    let { width, height } = img;
    if (width > MAX || height > MAX) {
      const ratio = Math.min(MAX / width, MAX / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return file;
    }
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85),
    );
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || !user) return;
    setUploading(true);
    try {
      const nextOrder =
        (items.filter((i) => i.slot === slot).at(-1)?.sort_order ?? 0) + 10;
      let i = 0;
      for (const file of Array.from(files)) {
        if (file.size > 15 * 1024 * 1024) {
          toast.error(`${file.name}: max 15 MB`);
          continue;
        }
        const blob = await optimiseImage(file);
        const ext = blob.type === "image/jpeg" ? "jpg" : file.name.split(".").pop() ?? "bin";
        const path = `${slot}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("site-gallery")
          .upload(path, blob, { contentType: blob.type, upsert: false });
        if (upErr) {
          toast.error(upErr.message);
          continue;
        }
        const { data: pub } = supabase.storage.from("site-gallery").getPublicUrl(path);
        const { error: insErr } = await supabase.from("gallery_images").insert({
          label: label || file.name,
          slot,
          url: pub.publicUrl,
          storage_path: path,
          sort_order: nextOrder + i * 10,
        });
        if (insErr) toast.error(insErr.message);
        i++;
      }
      toast.success("Upload complete");
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function swap(a: GalleryImage, b: GalleryImage) {
    setItems((prev) =>
      prev.map((x) =>
        x.id === a.id ? { ...x, sort_order: b.sort_order } : x.id === b.id ? { ...x, sort_order: a.sort_order } : x,
      ),
    );
    await Promise.all([
      supabase.from("gallery_images").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("gallery_images").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    await load();
  }

  async function remove(img: GalleryImage) {
    if (!confirm(`Delete "${img.label}"?`)) return;
    if (img.storage_path) {
      await supabase.storage.from("site-gallery").remove([img.storage_path]);
    }
    const { error } = await supabase.from("gallery_images").delete().eq("id", img.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setItems((prev) => prev.filter((x) => x.id !== img.id));
  }

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-[#C69B3C] animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F4EADE] flex items-center justify-center p-8">
        <div className="max-w-md text-center border border-[#C69B3C]/30 rounded-md p-8">
          <h1 className="text-2xl font-semibold text-[#C69B3C] tracking-wide">Admin only</h1>
          <p className="mt-3 text-sm text-[#F4EADE]/70">
            The Gallery vault is restricted to Sovereign administrators.
          </p>
        </div>
      </div>
    );
  }

  // Group by slot for display
  const grouped = SLOTS.map((s) => ({ slot: s, list: items.filter((i) => i.slot === s) }));

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F4EADE] flex">
      <AppSidebar />
      <main className="flex-1 p-6 md:p-10 max-w-6xl mx-auto">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[#C69B3C]">Site Vault</p>
          <h1 className="text-3xl md:text-4xl font-semibold mt-2">Image Gallery</h1>
          <p className="text-sm text-[#F4EADE]/60 mt-2">
            Upload, preview, and order imagery used across the site. Images are auto-optimised
            (max 1920px · JPEG 85%) before upload.
          </p>
        </header>

        {/* Upload card */}
        <section className="border border-[#C69B3C]/25 rounded-md p-5 bg-black/40 backdrop-blur">
          <div className="grid md:grid-cols-3 gap-4">
            <label className="text-xs uppercase tracking-widest">
              Slot
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value as typeof slot)}
                className="mt-1 block w-full bg-black/60 border border-[#C69B3C]/30 rounded px-3 py-2 text-sm"
              >
                {SLOTS.map((s) => (
                  <option key={s} value={s} className="bg-[#0A0A0A]">
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs uppercase tracking-widest md:col-span-2">
              Label (optional)
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Hero — Lagos training floor"
                className="mt-1 block w-full bg-black/60 border border-[#C69B3C]/30 rounded px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              disabled={uploading}
              className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-[#C69B3C] file:text-[#0A0A0A] hover:file:bg-[#D4AF37] disabled:opacity-50"
            />
            {uploading && (
              <span className="inline-flex items-center gap-2 text-sm text-[#C69B3C]">
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
              </span>
            )}
            <span className="text-xs text-[#F4EADE]/40 ml-auto">
              <Upload className="inline h-3 w-3 mr-1" /> max 15 MB per file
            </span>
          </div>
        </section>

        {/* Gallery list grouped by slot */}
        <section className="mt-10 space-y-10">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 text-[#C69B3C] animate-spin" />
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.slot}>
                <h2 className="text-sm uppercase tracking-[0.3em] text-[#C69B3C] mb-3">
                  {g.slot} · {g.list.length}
                </h2>
                {g.list.length === 0 ? (
                  <p className="text-xs text-[#F4EADE]/40 border border-dashed border-[#C69B3C]/20 rounded p-6 text-center">
                    No images in this slot yet.
                  </p>
                ) : (
                  <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {g.list.map((img, idx) => (
                      <li
                        key={img.id}
                        className="group relative border border-[#C69B3C]/20 rounded-md overflow-hidden bg-black/40"
                      >
                        <img
                          src={img.url}
                          alt={img.label}
                          loading="lazy"
                          className="w-full aspect-[4/3] object-cover"
                        />
                        <div className="p-3 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm truncate">{img.label || "Untitled"}</p>
                            <p className="text-[10px] uppercase tracking-widest text-[#F4EADE]/40">
                              #{img.sort_order}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              aria-label="Move up"
                              disabled={idx === 0}
                              onClick={() => swap(img, g.list[idx - 1])}
                              className="p-1.5 rounded hover:bg-[#C69B3C]/15 disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              aria-label="Move down"
                              disabled={idx === g.list.length - 1}
                              onClick={() => swap(img, g.list[idx + 1])}
                              className="p-1.5 rounded hover:bg-[#C69B3C]/15 disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              aria-label="Delete"
                              onClick={() => remove(img)}
                              className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}