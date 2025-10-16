'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'
import type { AuditLog } from '@/store/admin/types'

export const createAuditActions = (dispatch: Dispatch<AdminAction>) => ({
  setAuditLogs(logs: AuditLog[]) {
    dispatch({ type: 'SET_AUDIT_LOGS', payload: logs })
  },
  setAuditPage(page: number) {
    dispatch({ type: 'SET_AUDIT_PAGE', payload: page })
  },
  setAuditPageSize(pageSize: number) {
    dispatch({ type: 'SET_AUDIT_PAGE_SIZE', payload: pageSize })
  },
  setAuditTotal(total: number) {
    dispatch({ type: 'SET_AUDIT_TOTAL', payload: total })
  },
  setAuditInitialized(initialized: boolean) {
    dispatch({ type: 'SET_AUDIT_INITIALIZED', payload: initialized })
  },
})
