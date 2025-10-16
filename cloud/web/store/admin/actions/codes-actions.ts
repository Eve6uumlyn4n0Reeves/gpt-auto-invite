'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'
import type { CodeData } from '@/store/admin/types'

export const createCodesActions = (dispatch: Dispatch<AdminAction>) => ({
  setCodesLoading(value: boolean) {
    dispatch({ type: 'SET_CODES_LOADING', payload: value })
  },
  setCodes(codes: CodeData[]) {
    dispatch({ type: 'SET_CODES', payload: codes })
  },
  setCodesPage(page: number) {
    dispatch({ type: 'SET_CODES_PAGE', payload: page })
  },
  setCodesPageSize(pageSize: number) {
    dispatch({ type: 'SET_CODES_PAGE_SIZE', payload: pageSize })
  },
  setCodesTotal(total: number) {
    dispatch({ type: 'SET_CODES_TOTAL', payload: total })
  },
  setCodesInitialized(initialized: boolean) {
    dispatch({ type: 'SET_CODES_INITIALIZED', payload: initialized })
  },
})
