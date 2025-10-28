export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { UsersView } from "@/components/admin/views/users-view"
import { UsersProvider } from "@/store/users/context"

export default function AdminUsersPage() {
  return (
    <AdminPage view="users">
      <UsersProvider>
        <UsersView />
      </UsersProvider>
    </AdminPage>
  )
}
