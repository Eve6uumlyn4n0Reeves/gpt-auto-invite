'use client'

import { useCallback, useEffect, useState } from 'react'
import { BulkHistorySection } from '@/components/admin/sections/bulk-history-section'
import { useAdminContext, useAdminActions } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'

export function BulkHistoryView() {
  const { state } = useAdminContext()
  const { setBulkHistoryPage, setBulkHistoryPageSize } = useAdminActions()
  const { loadBulkHistory } = useAdminSimple()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    async (page = state.bulkHistoryPage, pageSize = state.bulkHistoryPageSize) => {
      setLoading(true)
      try {
        const result = await loadBulkHistory({ force: true, page, pageSize })
        if (!result.success) {
          setError(result.error || '获取批量历史失败')
        } else {
          setError(null)
        }
      } finally {
        setLoading(false)
      }
    },
    [loadBulkHistory, state.bulkHistoryPage, state.bulkHistoryPageSize],
  )

  useEffect(() => {
    if (state.authenticated !== true) return
    void refresh()
  }, [refresh, state.authenticated])

  const autoRefresh = useCallback(() => {
    void refresh()
  }, [refresh])

  useAdminAutoRefresh(autoRefresh, state.authenticated === true)

  const handlePageChange = useCallback(
    async (page: number) => {
      const next = Math.max(1, page)
      setBulkHistoryPage(next)
      await refresh(next, state.bulkHistoryPageSize)
    },
    [refresh, setBulkHistoryPage, state.bulkHistoryPageSize],
  )

  const handlePageSizeChange = useCallback(
    async (pageSize: number) => {
      const nextSize = Math.max(1, Math.min(pageSize, 200))
      setBulkHistoryPageSize(nextSize)
      setBulkHistoryPage(1)
      await refresh(1, nextSize)
    },
    [refresh, setBulkHistoryPage, setBulkHistoryPageSize],
  )

  return (
    <BulkHistorySection
      entries={state.bulkHistory}
      loading={loading}
      error={error}
      page={state.bulkHistoryPage}
      pageSize={state.bulkHistoryPageSize}
      total={state.bulkHistoryTotal}
      onRefresh={() => refresh()}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
    />
  )
}
