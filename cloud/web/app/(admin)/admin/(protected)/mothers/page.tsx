export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { MothersView } from "@/components/admin/views/mothers-view"

export default function AdminMothersPage() {
  return (
    <AdminPage view="mothers">
      <MothersView />
    </AdminPage>
  )
}
