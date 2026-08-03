import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/palmpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { processWebhook } = await import("@/lib/webhooks/framework.server");
        const { palmpayAdapter } = await import("@/lib/webhooks/adapters.server");
        return processWebhook(palmpayAdapter, request);
      },
    },
  },
});