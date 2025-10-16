export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { SettingsView } from "@/components/admin/views/settings-view"

export default function AdminSettingsPage() {
  return (
    <AdminPage view="settings">
      <SettingsView />
    </AdminPage>
  )
}
