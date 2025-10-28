export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { MothersView } from "@/components/admin/views/mothers-view"
import { PoolProvider } from "@/store/pool/context"

export default function AdminMothersPage() {
  return (
    <AdminPage view="mothers">
      <PoolProvider>
        <MothersView />
      </PoolProvider>
    </AdminPage>
  )
}
