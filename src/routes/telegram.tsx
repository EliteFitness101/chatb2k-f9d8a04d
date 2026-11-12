import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Backward-compatible Telegram Mini App entry point.
 *
 * The Telegram master bot's current Web App button targets /telegram.
 * Keep that public entry point stable and route it into the canonical
 * ChatB2K assessment/assistant experience instead of rendering the
 * application's generic 404 page.
 */
export const Route = createFileRoute("/telegram")({
  beforeLoad: () => {
    throw redirect({ to: "/chatb2k" });
  },
});
