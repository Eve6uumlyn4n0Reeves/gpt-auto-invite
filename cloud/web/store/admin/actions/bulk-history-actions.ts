'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'
import type { BulkHistoryEntry } from '@/store/admin/types'

export const createBulkHistoryActions = (dispatch: Dispatch<AdminAction>) => ({
  setBulkHistory(entries: BulkHistoryEntry[]) {
    dispatch({ type: 'SET_BULK_HISTORY', payload: entries })
  },
  setBulkHistoryPage(page: number) {
    dispatch({ type: 'SET_BULK_HISTORY_PAGE', payload: page })
  },
  setBulkHistoryPageSize(pageSize: number) {
    dispatch({ type: 'SET_BULK_HISTORY_PAGE_SIZE', payload: pageSize })
  },
  setBulkHistoryTotal(total: number) {
    dispatch({ type: 'SET_BULK_HISTORY_TOTAL', payload: total })
  },
  setBulkHistoryInitialized(initialized: boolean) {
    dispatch({ type: 'SET_BULK_HISTORY_INITIALIZED', payload: initialized })
  },
})
