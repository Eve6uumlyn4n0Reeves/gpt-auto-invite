'use client'

import { useEffect } from 'react'
import { useAdminContext } from '@/store/admin-context'

export function useAdminAutoRefresh(callback: () => void, enabled = true, intervalMs = 30_000) {
  const { state } = useAdminContext()

  useEffect(() => {
    if (!enabled) return
    if (state.authenticated !== true) return
    if (!state.autoRefresh) return

    const timer = window.setInterval(() => {
      callback()
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [callback, enabled, intervalMs, state.authenticated, state.autoRefresh])
}
