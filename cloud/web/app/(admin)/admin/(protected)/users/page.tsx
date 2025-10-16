export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { UsersView } from "@/components/admin/views/users-view"

export default function AdminUsersPage() {
  return (
    <AdminPage view="users">
      <UsersView />
    </AdminPage>
  )
}
