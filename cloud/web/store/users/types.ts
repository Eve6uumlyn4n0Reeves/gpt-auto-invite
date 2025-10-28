'use client'

export interface UsersUserData {
  id: number
  email: string
  status: string
  team_id?: string
  team_name?: string
  invited_at: string
  redeemed_at?: string
  code_used?: string
}

export interface UsersCodeData {
  id: number
  code: string
  batch_id?: string
  is_used: boolean
  created_at: string
  used_by?: string
  used_at?: string
}

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
  filterStatus: string
  searchTerm: string
}
