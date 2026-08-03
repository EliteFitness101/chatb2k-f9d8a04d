import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { processWebhook } = await import("@/lib/webhooks/framework.server");
        const { paystackAdapter } = await import("@/lib/webhooks/adapters.server");
        return processWebhook(paystackAdapter, request);
      },
    },
  },
});