export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { CodesView } from "@/components/admin/views/codes-view"
import { UsersProvider } from "@/store/users/context"

export default function AdminCodesPage() {
  return (
    <AdminPage view="codes">
      <UsersProvider>
        <CodesView />
      </UsersProvider>
    </AdminPage>
  )
}
