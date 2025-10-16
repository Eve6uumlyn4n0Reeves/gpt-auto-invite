'use client'

import { useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { OverviewSection } from '@/components/admin/sections/overview-section'
import { useAdminContext } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'

export function OverviewView() {
  const router = useRouter()
  const { state } = useAdminContext()
  const { loadStats, loadAuditLogs } = useAdminSimple()

  const quickStats = useMemo(() => {
    const recent = state.stats?.recent_activity ?? []
    const today = recent[0] ?? { invites: 0, redemptions: 0 }
    const breakdown = (state.stats?.status_breakdown ?? {}) as Record<string, number>
    const totalInvites = Object.values(breakdown).reduce((sum, value) => sum + (value ?? 0), 0)
    const successRate =
      totalInvites > 0 ? Math.round(((breakdown.sent ?? 0) / totalInvites) * 1000) / 10 : 0

    return {
      todayRedemptions: today.redemptions ?? 0,
      todayInvites: today.invites ?? 0,
      avgResponseTime: 0,
      successRate,
    }
  }, [state.stats])

  const handleRefreshStats = useCallback(() => {
    void loadStats()
  }, [loadStats])

  const refreshAuditLogs = useCallback(() => {
    void loadAuditLogs({
      page: state.auditPage,
      pageSize: state.auditPageSize,
    })
  }, [loadAuditLogs, state.auditPage, state.auditPageSize])

  useEffect(() => {
    if (state.authenticated !== true) return
    refreshAuditLogs()
  }, [refreshAuditLogs, state.authenticated])

  useAdminAutoRefresh(refreshAuditLogs, state.authenticated === true)

  const handleNavigateToCodesStatus = useCallback(() => {
    router.push('/admin/codes-status')
  }, [router])

  const handleNavigateToAudit = useCallback(() => {
    router.push('/admin/audit')
  }, [router])

  return (
    <OverviewSection
      serviceStatus={state.serviceStatus}
      autoRefresh={state.autoRefresh}
      stats={state.stats}
      statsLoading={state.statsLoading}
      onRefreshStats={handleRefreshStats}
      onNavigateToCodesStatus={handleNavigateToCodesStatus}
      onNavigateToAudit={handleNavigateToAudit}
      remainingQuota={state.stats?.remaining_code_quota ?? null}
      maxCodeCapacity={state.stats?.max_code_capacity ?? null}
      activeCodesCount={state.stats?.active_codes ?? null}
      quickStats={quickStats}
      auditLoading={false}
      auditLogs={state.auditLogs}
    />
  )
}
