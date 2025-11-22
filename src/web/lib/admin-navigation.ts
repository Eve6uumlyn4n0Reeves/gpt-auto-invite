export type AdminTab =
  | "mothers"
  | "auto-ingest"
  | "users"
  | "codes"
  | "codes-status"
  | "bulk-import"
  | "bulk-history"
  | "overview"
  | "audit"
  | "settings"
  | "jobs"
  | "pool-groups"
  | "switch-queue"

export const ADMIN_TAB_ROUTES: Record<AdminTab, string> = {
  mothers: "/admin/mothers",
  "auto-ingest": "/admin/auto-ingest",
  users: "/admin/users",
  codes: "/admin/codes",
  "codes-status": "/admin/codes-status",
  "bulk-import": "/admin/bulk-import",
  "bulk-history": "/admin/bulk-history",
  overview: "/admin/overview",
  audit: "/admin/audit",
  settings: "/admin/settings",
  jobs: "/admin/jobs",
  "pool-groups": "/admin/pool-groups",
  "switch-queue": "/admin/switch-queue",
}
