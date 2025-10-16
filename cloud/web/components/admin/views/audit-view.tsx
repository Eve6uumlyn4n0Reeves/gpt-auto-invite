'use client'

import { useCallback, useEffect, useState } from 'react'
import { AuditSection } from '@/components/admin/sections/audit-section'
import { useAdminContext, useAdminActions } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'

export function AuditView() {
  const { state } = useAdminContext()
  const { setAuditPage, setAuditPageSize } = useAdminActions()
  const { loadAuditLogs } = useAdminSimple()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    async (page = state.auditPage, pageSize = state.auditPageSize) => {
      setLoading(true)
      try {
        const result = await loadAuditLogs({ page, pageSize })
        if (!result.success) {
          setError(result.error || '加载审计日志失败')
        } else {
          setError(null)
        }
      } finally {
        setLoading(false)
      }
    },
    [loadAuditLogs, state.auditPage, state.auditPageSize],
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
      setAuditPage(next)
      await refresh(next, state.auditPageSize)
    },
    [refresh, setAuditPage, state.auditPageSize],
  )

  const handlePageSizeChange = useCallback(
    async (pageSize: number) => {
      const nextSize = Math.max(1, Math.min(pageSize, 200))
      setAuditPageSize(nextSize)
      setAuditPage(1)
      await refresh(1, nextSize)
    },
    [refresh, setAuditPage, setAuditPageSize],
  )

  return (
    <AuditSection
      loading={loading}
      error={error}
      logs={state.auditLogs}
      page={state.auditPage}
      pageSize={state.auditPageSize}
      total={state.auditTotal}
      onRefresh={() => refresh()}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
    />
  )
}
