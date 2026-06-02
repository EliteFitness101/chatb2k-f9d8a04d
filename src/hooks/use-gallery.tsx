import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GalleryImage {
  id: string;
  label: string;
  slot: string;
  url: string;
  sort_order: number;
}

const cache = new Map<string, GalleryImage[]>();
const listeners = new Map<string, Set<(items: GalleryImage[]) => void>>();
const inflight = new Map<string, Promise<GalleryImage[]>>();

async function fetchSlot(slot: string): Promise<GalleryImage[]> {
  if (cache.has(slot)) return cache.get(slot)!;
  if (inflight.has(slot)) return inflight.get(slot)!;
  const p = (async () => {
    const { data } = await supabase
      .from("gallery_images")
      .select("id,label,slot,url,sort_order")
      .eq("slot", slot)
      .order("sort_order", { ascending: true });
    const items = (data ?? []) as GalleryImage[];
    cache.set(slot, items);
    listeners.get(slot)?.forEach((cb) => cb(items));
    inflight.delete(slot);
    return items;
  })();
  inflight.set(slot, p);
  return p;
}

export function useGalleryBySlot(slot: string) {
  const [items, setItems] = useState<GalleryImage[]>(() => cache.get(slot) ?? []);
  useEffect(() => {
    let alive = true;
    if (!listeners.has(slot)) listeners.set(slot, new Set());
    const cb = (next: GalleryImage[]) => alive && setItems(next);
    listeners.get(slot)!.add(cb);
    fetchSlot(slot).then((v) => alive && setItems(v));
    return () => {
      alive = false;
      listeners.get(slot)?.delete(cb);
    };
  }, [slot]);
  return items;
}

/**
 * Find a product image by trying common label keys (sku, slug, title).
 * Falls back to the first image in the slot when matchKeys is empty.
 */
export function findGalleryImage(items: GalleryImage[], matchKeys: string[]) {
  if (items.length === 0) return null;
  const lowered = matchKeys.map((k) => k.toLowerCase());
  return (
    items.find((i) => lowered.includes((i.label ?? "").toLowerCase().trim())) ?? null
  );
}