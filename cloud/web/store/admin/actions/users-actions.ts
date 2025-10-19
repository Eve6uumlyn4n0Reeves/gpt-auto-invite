'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'

export const createUsersActions = (dispatch: Dispatch<AdminAction>) => ({
  setUsersPage(page: number) {
    dispatch({ type: 'SET_USERS_PAGE', payload: page })
  },
  setUsersPageSize(pageSize: number) {
    dispatch({ type: 'SET_USERS_PAGE_SIZE', payload: pageSize })
  },
})
