'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'
import type { MotherAccount } from '@/store/admin/types'

export const createMothersActions = (dispatch: Dispatch<AdminAction>) => ({
  setMothersLoading(value: boolean) {
    dispatch({ type: 'SET_MOTHERS_LOADING', payload: value })
  },
  setMothers(mothers: MotherAccount[]) {
    dispatch({ type: 'SET_MOTHERS', payload: mothers })
  },
  setMothersPage(page: number) {
    dispatch({ type: 'SET_MOTHERS_PAGE', payload: page })
  },
  setMothersPageSize(pageSize: number) {
    dispatch({ type: 'SET_MOTHERS_PAGE_SIZE', payload: pageSize })
  },
  setMothersTotal(total: number) {
    dispatch({ type: 'SET_MOTHERS_TOTAL', payload: total })
  },
  setMothersInitialized(initialized: boolean) {
    dispatch({ type: 'SET_MOTHERS_INITIALIZED', payload: initialized })
  },
})
