'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'
import type { UserData } from '@/store/admin/types'

export const createUsersActions = (dispatch: Dispatch<AdminAction>) => ({
  setUsersLoading(value: boolean) {
    dispatch({ type: 'SET_USERS_LOADING', payload: value })
  },
  setUsers(users: UserData[]) {
    dispatch({ type: 'SET_USERS', payload: users })
  },
  setUsersPage(page: number) {
    dispatch({ type: 'SET_USERS_PAGE', payload: page })
  },
  setUsersPageSize(pageSize: number) {
    dispatch({ type: 'SET_USERS_PAGE_SIZE', payload: pageSize })
  },
  setUsersTotal(total: number) {
    dispatch({ type: 'SET_USERS_TOTAL', payload: total })
  },
  setUsersInitialized(initialized: boolean) {
    dispatch({ type: 'SET_USERS_INITIALIZED', payload: initialized })
  },
})
