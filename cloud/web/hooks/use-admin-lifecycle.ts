'use client'

import { useEffect, useMemo } from 'react'
import { useAdminContext, useAdminActions } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import type { AdminTab } from '@/lib/admin-navigation'

interface UseAdminLifecycleResult {
  isCheckingAuth: boolean
  isAuthenticated: boolean
  currentTab: AdminTab
}

export function useAdminLifecycle(view: AdminTab): UseAdminLifecycleResult {
  const { state } = useAdminContext()
  const { setCurrentTab } = useAdminActions()
  const { checkAuth } = useAdminSimple()

  useEffect(() => {
    setCurrentTab(view)
  }, [setCurrentTab, view])

  useEffect(() => {
    if (state.authenticated === null) {
      void checkAuth()
    }
  }, [checkAuth, state.authenticated])

  return useMemo(
    () => ({
      isCheckingAuth: state.authenticated === null,
      isAuthenticated: state.authenticated === true,
      currentTab: view,
    }),
    [state.authenticated, view],
  )
}
