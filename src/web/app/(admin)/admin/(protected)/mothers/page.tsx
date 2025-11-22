export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { MothersView } from "@/domains/pool/views/mothers-view"
import { PoolProvider } from "@/domains/pool/store"

export default function AdminMothersPage() {
  return (
    <AdminPage view="mothers">
      <PoolProvider>
        <MothersView />
      </PoolProvider>
    </AdminPage>
  )
}
