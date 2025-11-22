export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { CodesStatusView } from "@/components/admin/views/codes-status-view"

export default function AdminCodesStatusPage() {
  return (
    <AdminPage view="codes-status">
      <CodesStatusView />
    </AdminPage>
  )
}
