export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { CodesView } from "@/domains/users/views/codes-view"
import { UsersProvider } from "@/domains/users/store"

export default function AdminCodesPage() {
  return (
    <AdminPage view="codes">
      <UsersProvider>
        <CodesView />
      </UsersProvider>
    </AdminPage>
  )
}
