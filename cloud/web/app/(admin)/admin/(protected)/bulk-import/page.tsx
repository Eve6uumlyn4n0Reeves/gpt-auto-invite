export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { BulkImportView } from "@/components/admin/views/bulk-import-view"

export default function AdminBulkImportPage() {
  return (
    <AdminPage view="bulk-import">
      <BulkImportView />
    </AdminPage>
  )
}
