'use client'

import { useCallback, useEffect, type ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAdminContext } from '@/store/admin-context'
import { useAdminLifecycle } from '@/hooks/use-admin-lifecycle'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import type { AdminTab } from '@/lib/admin-navigation'
import { AdminLoginForm } from '@/components/admin/login-form'
import { StatsCards } from '@/components/admin/stats-cards'
import { SearchFilters } from '@/components/admin/search-filters'

interface AdminPageProps {
  view: AdminTab
  children: ReactNode
  showStats?: boolean
  showFilters?: boolean
}

const FILTER_VIEWS = new Set<AdminTab>(['users', 'codes', 'codes-status'])

export function AdminPage({
  view,
  children,
  showStats = true,
  showFilters,
}: AdminPageProps) {
  const { state } = useAdminContext()
  const lifecycle = useAdminLifecycle(view)
  const { loadStats } = useAdminSimple()

  const refreshStats = useCallback(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    if (!lifecycle.isAuthenticated) return
    if (!showStats) return
    refreshStats()
  }, [lifecycle.isAuthenticated, refreshStats, showStats])

  useAdminAutoRefresh(refreshStats, lifecycle.isAuthenticated && showStats)

  if (lifecycle.isCheckingAuth) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p>正在检查登录状态…</p>
      </div>
    )
  }

  if (!lifecycle.isAuthenticated) {
    return <AdminLoginForm />
  }

  const shouldShowFilters = typeof showFilters === 'boolean' ? showFilters : FILTER_VIEWS.has(view)

  return (
    <div className="space-y-6">
      {state.error && (
        <Alert className="border-red-500/40 bg-red-500/10">
          <AlertDescription className="text-red-600">{state.error}</AlertDescription>
        </Alert>
      )}

      {showStats && <StatsCards />}

      {shouldShowFilters && <SearchFilters />}

      {children}
    </div>
  )
}
