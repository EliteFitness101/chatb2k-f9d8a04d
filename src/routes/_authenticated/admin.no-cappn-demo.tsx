import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/no-cappn-demo")({
  head: () => ({
    meta: [
      { title: "No Cappn — BIGO Agency Command Center" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/admin/no-cappn" });
  },
  component: () => null,
});
