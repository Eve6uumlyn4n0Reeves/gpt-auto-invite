export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { AuditView } from "@/components/admin/views/audit-view"

export default function AdminAuditPage() {
  return (
    <AdminPage view="audit">
      <AuditView />
    </AdminPage>
  )
}
