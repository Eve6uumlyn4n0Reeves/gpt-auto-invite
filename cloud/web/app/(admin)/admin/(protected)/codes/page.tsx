export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { CodesView } from "@/components/admin/views/codes-view"

export default function AdminCodesPage() {
  return (
    <AdminPage view="codes">
      <CodesView />
    </AdminPage>
  )
}
