// Client-safe RBAC contract for the Enterprise Admin Command Center.

export type AdminPermission =
  | "orders.read"
  | "orders.write"
  | "payments.read"
  | "payments.manage"
  | "inventory.read"
  | "inventory.manage"
  | "customers.read"
  | "customers.manage"
  | "analytics.read"
  | "audit.read"
  | "hub.manage"
  | "catalog.manage"
  | "content.manage";

export type AdminRole =
  | "super_admin"
  | "operations_admin"
  | "finance_admin"
  | "catalog_admin"
  | "warehouse_admin"
  | "coach_admin"
  | "support_admin"
  | "content_admin"
  | "analytics_admin"
  | "compliance_admin";

export interface AdminDomain {
  key: string;
  label: string;
  to: string;
  permission: AdminPermission;
}

/** The nine operational domains of the command center. */
export const ADMIN_DOMAINS: AdminDomain[] = [
  { key: "overview", label: "Global Overview", to: "/admin", permission: "analytics.read" },
  { key: "revenue", label: "Revenue & Finance", to: "/admin/revenue", permission: "analytics.read" },
  { key: "orders", label: "Orders", to: "/admin/orders", permission: "orders.read" },
  { key: "payments", label: "Payments", to: "/admin/payments", permission: "payments.read" },
  { key: "inventory", label: "Inventory", to: "/admin/inventory", permission: "inventory.read" },
  { key: "fulfillment", label: "Fulfillment Hubs", to: "/admin/fulfillment", permission: "inventory.read" },
  { key: "operations", label: "Operations", to: "/admin/operations", permission: "orders.read" },
  { key: "customers", label: "Customer Intelligence", to: "/admin/customers", permission: "customers.read" },
  { key: "chatb2k", label: "ChatB2K Intelligence", to: "/admin/chatb2k", permission: "analytics.read" },
  { key: "compliance", label: "Compliance & Audit", to: "/admin/compliance", permission: "audit.read" },
];

export const ALERT_LEVELS = ["info", "warning", "critical"] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];
export type AlertStatus = "open" | "acknowledged" | "resolved";