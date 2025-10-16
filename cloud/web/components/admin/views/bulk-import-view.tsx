'use client'

import { BulkMotherImport } from '@/components/admin/bulk-import'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { useAdminQuota } from '@/hooks/use-admin-quota'
import { useAdminContext } from '@/store/admin-context'

export function BulkImportView() {
  const { state } = useAdminContext()
  const { loadMothers, loadStats, loadBulkHistory } = useAdminSimple()
  const quota = useAdminQuota()

  return (
    <BulkMotherImport
      onRefreshMothers={() =>
        loadMothers({
          page: state.mothersPage,
          pageSize: state.mothersPageSize,
          search: state.searchTerm,
        })
      }
      onRefreshStats={loadStats}
      onRefreshQuota={quota.refresh}
      onRefreshHistory={() =>
        loadBulkHistory({
          force: true,
          page: state.bulkHistoryPage,
          pageSize: state.bulkHistoryPageSize,
        })
      }
    />
  )
}
