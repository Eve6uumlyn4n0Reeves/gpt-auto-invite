'use client'

// 为避免重复定义，Pool 域目前仅声明自身需要的最小类型。
// 后续可逐步扩展并与 Users 域完全解耦。

export interface PoolMotherTeam {
  team_id: string
  team_name?: string
  is_enabled: boolean
  is_default: boolean
}

export interface PoolMotherAccount {
  id: number
  name: string
  status: string
  seat_limit: number
  seats_used: number
  token_expires_at?: string
  notes?: string
  teams: PoolMotherTeam[]
}

export interface PoolState {
  mothers: PoolMotherAccount[]
  mothersPage: number
  mothersPageSize: number
  mothersTotal: number
  mothersInitialized: boolean
  mothersLoading: boolean

  // Pool Groups
  poolGroups: Array<{ id: number; name: string; description?: string | null; is_active: boolean }>
  poolGroupsLoading: boolean
  poolGroupsInitialized: boolean
  selectedGroupId: number | null
  teamTemplate: string
  childNameTemplate: string
  childEmailTemplate: string
  emailDomain: string
  namePreview: string[]
  savingSettings: boolean
  creatingGroup: boolean
}
