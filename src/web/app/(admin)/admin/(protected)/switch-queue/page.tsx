export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { SwitchQueueView } from "@/components/admin/views/switch-queue-view"

export default function SwitchQueuePage() {
  return (
    <AdminPage view="switch-queue">
      <SwitchQueueView />
    </AdminPage>
  )
}

