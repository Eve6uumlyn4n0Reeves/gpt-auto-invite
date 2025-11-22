export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { OverviewView } from "@/components/admin/views/overview-view"

export default function AdminOverviewPage() {
  return (
    <AdminPage view="overview">
      <OverviewView />
    </AdminPage>
  )
}
