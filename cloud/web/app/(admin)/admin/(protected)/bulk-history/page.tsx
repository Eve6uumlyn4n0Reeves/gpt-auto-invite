export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { BulkHistoryView } from "@/components/admin/views/bulk-history-view"

export default function AdminBulkHistoryPage() {
  return (
    <AdminPage view="bulk-history">
      <BulkHistoryView />
    </AdminPage>
  )
}
