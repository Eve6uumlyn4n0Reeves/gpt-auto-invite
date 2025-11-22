'use client'

import type { InviteStatus, CodeStatus, InviteListItem, RedeemCodeItem } from '@/shared/api-types'

export type FilterStatus = 'all' | InviteStatus | CodeStatus

export type UsersUserData = InviteListItem

export type UsersCodeData = RedeemCodeItem

export interface UsersState {
  // Users list pagination
  usersPage: number
  usersPageSize: number
  usersTotal: number

  // Codes list pagination
  codesPage: number
  codesPageSize: number
  codesTotal: number

  // UI
  filterStatus: FilterStatus
  searchTerm: string
}
