export const dynamic = "force-dynamic"

import { AdminPage } from "@/components/admin/admin-page"
import { AutoIngestMain } from "@/components/auto-ingest/auto-ingest-main"

export default function AutoIngestPage() {
  return (
    <AdminPage
      view="auto-ingest"
      showStats={false}
      showFilters={false}
    >
      <AutoIngestMain />
    </AdminPage>
  )
}