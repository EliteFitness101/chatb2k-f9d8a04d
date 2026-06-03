import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { productBySku } from "@/lib/catalog";

const InitSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  items: z
    .array(z.object({ sku: z.string(), quantity: z.number().int().positive() }))
    .min(1),
});

// Initialize a Paystack transaction. Returns reference + access_code.
export const initPaystackTransaction = createServerFn({ method: "POST" })
  .inputValidator((data) => InitSchema.parse(data))
  .handler(async ({ data }) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return { ok: false as const, error: "Paystack not configured" };
    }

    // Compute amount server-side from canonical catalog (never trust client)
    let amountKobo = 0;
    const lines: { sku: string; title: string; quantity: number; unit: number; category: string }[] = [];
    for (const item of data.items) {
      const p = productBySku(item.sku);
      if (!p) return { ok: false as const, error: `Unknown SKU ${item.sku}` };
      amountKobo += p.ngnMinor * item.quantity;
      lines.push({
        sku: p.sku,
        title: p.title,
        quantity: item.quantity,
        unit: p.ngnMinor,
        category: p.category,
      });
    }

    const reference = `RES-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Find a hub (default to Global HQ)
    const { data: hub } = await supabaseAdmin
      .from("hubs")
      .select("id")
      .eq("tier", "global_hq")
      .maybeSingle();

    // Persist pending order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        reference,
        rail: "paystack",
        currency: "NGN",
        amount_minor: amountKobo,
        status: "pending",
        customer_email: data.email,
        customer_name: data.name,
        customer_country: "NG",
        assigned_hub_id: hub?.id ?? null,
      })
      .select()
      .single();

    if (orderErr || !order) {
      console.error("Order insert failed:", orderErr);
      return { ok: false as const, error: "Could not create order" };
    }

    await supabaseAdmin.from("order_items").insert(
      lines.map((l) => ({
        order_id: order.id,
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unit_amount_minor: l.unit,
        category: l.category,
      })),
    );

    // Initialize with Paystack
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: data.email,
        amount: amountKobo,
        currency: "NGN",
        reference,
        metadata: { order_id: order.id, name: data.name },
      }),
    });

    const json = (await res.json()) as {
      status: boolean;
      message: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };

    if (!res.ok || !json.status || !json.data) {
      console.error("Paystack init failed:", json);
      return { ok: false as const, error: json.message || "Paystack init failed" };
    }

    return {
      ok: true as const,
      reference,
      access_code: json.data.access_code,
      authorization_url: json.data.authorization_url,
      amount: amountKobo,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? null,
    };
  });

// Verify a transaction by reference and update order status.
export const verifyPaystackTransaction = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ reference: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { ok: false as const, error: "Not configured" };

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const json = (await res.json()) as {
      status: boolean;
      data?: { status: string; amount: number };
    };

    if (!json.status || !json.data) {
      return { ok: false as const, error: "Verify failed" };
    }

    const newStatus = json.data.status === "success" ? "paid" : "failed";
    await supabaseAdmin
      .from("orders")
      .update({ status: newStatus })
      .eq("reference", data.reference);

    return { ok: true as const, status: newStatus };
  });

export const getOrderByReference = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ reference: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("*, order_items(*), hubs(*)")
      .eq("reference", data.reference)
      .maybeSingle();
    return { order };
  });