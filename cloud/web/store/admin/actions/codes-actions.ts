'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'

export const createCodesActions = (dispatch: Dispatch<AdminAction>) => ({
  setCodesPage(page: number) {
    dispatch({ type: 'SET_CODES_PAGE', payload: page })
  },
  setCodesPageSize(pageSize: number) {
    dispatch({ type: 'SET_CODES_PAGE_SIZE', payload: pageSize })
  },
})
