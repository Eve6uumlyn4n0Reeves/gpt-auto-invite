export type AdminTab =
  | "mothers"
  | "users"
  | "codes"
  | "codes-status"
  | "bulk-import"
  | "bulk-history"
  | "overview"
  | "audit"
  | "settings"

export const ADMIN_TAB_ROUTES: Record<AdminTab, string> = {
  mothers: "/admin/mothers",
  users: "/admin/users",
  codes: "/admin/codes",
  "codes-status": "/admin/codes-status",
  "bulk-import": "/admin/bulk-import",
  "bulk-history": "/admin/bulk-history",
  overview: "/admin/overview",
  audit: "/admin/audit",
  settings: "/admin/settings",
}
