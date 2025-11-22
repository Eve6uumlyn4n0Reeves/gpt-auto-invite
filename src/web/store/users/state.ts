'use client'

import type { UsersState } from './types'

export const initialUsersState: UsersState = {
  usersPage: 1,
  usersPageSize: 20,
  usersTotal: 0,
  codesPage: 1,
  codesPageSize: 20,
  codesTotal: 0,
  filterStatus: 'all',
  searchTerm: '',
}
