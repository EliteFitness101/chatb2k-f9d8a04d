import { createFileRoute } from "@tanstack/react-router";
import { Route as RevenueRoute } from "./admin.revenue";

// Alias route: /admin/revenue-ai → same AI CEO Revenue Console as /admin/revenue.
export const Route = createFileRoute("/_authenticated/admin/revenue-ai")({
  head: () => ({
    meta: [
      { title: "Revenue AI — Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RevenueRoute.options.component!,
});