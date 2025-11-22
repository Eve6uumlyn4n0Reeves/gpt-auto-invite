export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { JobsView } from "@/components/admin/views/jobs-view"

export default function AdminJobsPage() {
  return (
    <AdminPage view="jobs" showFilters={false}>
      <JobsView />
    </AdminPage>
  )
}

