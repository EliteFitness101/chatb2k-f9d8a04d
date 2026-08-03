import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/crypto")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { processWebhook } = await import("@/lib/webhooks/framework.server");
        const { cryptoAdapter } = await import("@/lib/webhooks/adapters.server");
        return processWebhook(cryptoAdapter, request);
      },
    },
  },
});