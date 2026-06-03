import { createServerFn } from "@tanstack/react-start";

// Expose the Paystack PUBLIC key (safe for browser) to the client.
export const getPaystackPublicKey = createServerFn({ method: "GET" }).handler(
  async () => {
    return { publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? null };
  },
);