'use client'

import type { MotherAccountSummary, MotherTeamSummary, PoolGroupSummary } from '@/shared/api-types'

export type PoolMotherTeam = MotherTeamSummary

export type PoolMotherAccount = MotherAccountSummary

export interface PoolState {
  mothers: PoolMotherAccount[]
  mothersPage: number
  mothersPageSize: number
  mothersTotal: number
  mothersInitialized: boolean
  mothersLoading: boolean

  // Pool Groups
  poolGroups: PoolGroupSummary[]
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
