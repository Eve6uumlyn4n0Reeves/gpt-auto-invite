'use client'

import type { UsersState, FilterStatus } from './types'
import { initialUsersState } from './state'

export type UsersAction =
  | { type: 'USERS_SET_USERS_PAGE'; payload: number }
  | { type: 'USERS_SET_USERS_PAGE_SIZE'; payload: number }
  | { type: 'USERS_SET_USERS_TOTAL'; payload: number }
  | { type: 'USERS_SET_CODES_PAGE'; payload: number }
  | { type: 'USERS_SET_CODES_PAGE_SIZE'; payload: number }
  | { type: 'USERS_SET_CODES_TOTAL'; payload: number }
  | { type: 'USERS_SET_FILTER_STATUS'; payload: FilterStatus }
  | { type: 'USERS_SET_SEARCH_TERM'; payload: string }

export const usersReducer = (state: UsersState, action: UsersAction): UsersState => {
  switch (action.type) {
    case 'USERS_SET_USERS_PAGE':
      return { ...state, usersPage: action.payload }
    case 'USERS_SET_USERS_PAGE_SIZE':
      return { ...state, usersPageSize: action.payload }
    case 'USERS_SET_USERS_TOTAL':
      return { ...state, usersTotal: action.payload }
    case 'USERS_SET_CODES_PAGE':
      return { ...state, codesPage: action.payload }
    case 'USERS_SET_CODES_PAGE_SIZE':
      return { ...state, codesPageSize: action.payload }
    case 'USERS_SET_CODES_TOTAL':
      return { ...state, codesTotal: action.payload }
    case 'USERS_SET_FILTER_STATUS':
      return { ...state, filterStatus: action.payload }
    case 'USERS_SET_SEARCH_TERM':
      return { ...state, searchTerm: action.payload }
    default:
      return state
  }
}

export const buildInitialUsersState = (overrides?: Partial<UsersState>): UsersState => {
  if (!overrides) return JSON.parse(JSON.stringify(initialUsersState)) as UsersState
  return { ...initialUsersState, ...overrides }
}
