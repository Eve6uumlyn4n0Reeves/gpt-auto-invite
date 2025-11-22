export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { UsersView } from "@/domains/users/views/users-view"
import { UsersProvider } from "@/domains/users/store"

export default function AdminUsersPage() {
  return (
    <AdminPage view="users">
      <UsersProvider>
        <UsersView />
      </UsersProvider>
    </AdminPage>
  )
}
