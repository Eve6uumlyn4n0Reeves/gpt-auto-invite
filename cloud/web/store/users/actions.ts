'use client'

import type { Dispatch } from 'react'
import type { UsersAction } from './reducer'

export const createUsersActions = (dispatch: Dispatch<UsersAction>) => ({
  setUsersPage(page: number) {
    dispatch({ type: 'USERS_SET_USERS_PAGE', payload: page })
  },
  setUsersPageSize(pageSize: number) {
    dispatch({ type: 'USERS_SET_USERS_PAGE_SIZE', payload: pageSize })
  },
  setUsersTotal(total: number) {
    dispatch({ type: 'USERS_SET_USERS_TOTAL', payload: total })
  },
  setCodesPage(page: number) {
    dispatch({ type: 'USERS_SET_CODES_PAGE', payload: page })
  },
  setCodesPageSize(pageSize: number) {
    dispatch({ type: 'USERS_SET_CODES_PAGE_SIZE', payload: pageSize })
  },
  setCodesTotal(total: number) {
    dispatch({ type: 'USERS_SET_CODES_TOTAL', payload: total })
  },
  setFilterStatus(status: string) {
    dispatch({ type: 'USERS_SET_FILTER_STATUS', payload: status })
  },
  setSearchTerm(term: string) {
    dispatch({ type: 'USERS_SET_SEARCH_TERM', payload: term })
  },
  dispatch,
})
