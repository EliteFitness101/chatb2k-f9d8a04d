import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { productBySku } from "@/lib/catalog";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publishEvent } from "@/lib/events.server";

const InitSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  items: z
    .array(z.object({ sku: z.string(), quantity: z.number().int().positive() }))
    .min(1),
  rsid: z.string().max(64).optional(),
  utm: z.record(z.string(), z.string().max(256)).optional(),
  source: z.string().max(64).optional(),
  variant: z.string().max(64).optional(),
});

export const initPaystackTransaction = createServerFn({ method: "POST" })
  .inputValidator((data) => InitSchema.parse(data))
  .handler(async ({ data }) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { ok: false as const, error: "Paystack not configured" };

    let amountKobo = 0;
    const lines: { sku: string; title: string; quantity: number; unit: number; category: string }[] = [];
    for (const item of data.items) {
      const p = productBySku(item.sku);
      if (!p) return { ok: false as const, error: `Unknown SKU ${item.sku}` };
      amountKobo += p.ngnMinor * item.quantity;
      lines.push({ sku: p.sku, title: p.title, quantity: item.quantity, unit: p.ngnMinor, category: p.category });
    }

    const reference = `RES-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const amountMajor = amountKobo / 100;
    const first = lines[0];

    // Canonical production financial ledger. Do not create retired `orders`
    // rows: the live ResoFit database uses payments + revenue_events and the
    // finalize_payment_success RPC as the authoritative settlement path.
    const { error: paymentError } = await supabaseAdmin.from("payments").insert({
      amount: amountMajor,
      gross_amount: amountMajor,
      currency: "NGN",
      customer_email: data.email,
      funnel_origin: "chatb2k",
      paystack_ref: reference,
      product_sku: first?.sku ?? null,
      rsid: data.rsid ?? null,
      status: "pending",
      gateway_response: null,
      plan_type: first?.category ?? "commerce",
    });

    if (paymentError) {
      console.error("[paystack] canonical payment insert failed", paymentError);
      return { ok: false as const, error: "Could not create payment record" };
    }

    await publishEvent("OrderCreated", reference, reference, {
      reference,
      amount_minor: amountKobo,
      amount: amountMajor,
      currency: "NGN",
      email: data.email,
      name: data.name,
      rsid: data.rsid ?? null,
      utm: data.utm ?? {},
      sku: first?.sku ?? null,
      items: lines,
      high_ticket: amountKobo >= 38_000_000,
    });

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
        metadata: {
          name: data.name,
          rsid: data.rsid ?? null,
          utm: data.utm ?? {},
          source: data.source ?? null,
          variant: data.variant ?? null,
          sku: first?.sku ?? null,
          funnel_origin: "chatb2k",
          high_ticket: amountKobo >= 38_000_000,
        },
      }),
    });

    const json = (await res.json()) as {
      status: boolean;
      message: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };

    if (!res.ok || !json.status || !json.data) {
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed", gateway_response: json.message || "Paystack init failed" })
        .eq("paystack_ref", reference);
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

export const verifyPaystackTransaction = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ reference: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { ok: false as const, error: "Not configured" };

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const json = (await res.json()) as { status: boolean; data?: { status: string; amount: number } };
    if (!json.status || !json.data) return { ok: false as const, error: "Verify failed" };

    const paystackStatus = json.data.status;
    const mapped =
      paystackStatus === "success"
        ? ("paid" as const)
        : paystackStatus === "failed" || paystackStatus === "reversed"
          ? ("failed" as const)
          : ("pending" as const);
    return { ok: true as const, status: mapped };
  });

export const getOrderByReference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ reference: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("paystack_ref", data.reference)
      .maybeSingle();
    return { order: payment };
  });
