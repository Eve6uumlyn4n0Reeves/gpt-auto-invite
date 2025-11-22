'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'
import type { ServiceStatus } from '@/store/admin/types'

export const createUiActions = (dispatch: Dispatch<AdminAction>) => ({
  setCurrentTab(value: string) {
    dispatch({ type: 'SET_CURRENT_TAB', payload: value })
  },
  setSearchTerm(value: string) {
    dispatch({ type: 'SET_SEARCH_TERM', payload: value })
  },
  setFilterStatus(value: string) {
    dispatch({ type: 'SET_FILTER_STATUS', payload: value })
  },
  setSortBy(value: string) {
    dispatch({ type: 'SET_SORT_BY', payload: value })
  },
  setSortOrder(value: 'asc' | 'desc') {
    dispatch({ type: 'SET_SORT_ORDER', payload: value })
  },
  setAutoRefresh(value: boolean) {
    dispatch({ type: 'SET_AUTO_REFRESH', payload: value })
  },
  setError(value: string | null) {
    dispatch({ type: 'SET_ERROR', payload: value })
  },
  clearError() {
    dispatch({ type: 'CLEAR_ERROR' })
  },
  setServiceStatus(status: ServiceStatus) {
    dispatch({ type: 'SET_SERVICE_STATUS', payload: status })
  },
})
