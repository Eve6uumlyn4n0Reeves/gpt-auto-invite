'use client'

import type {
  MotherAccountSummary,
  InviteListItem,
  RedeemCodeItem,
  AuditLogEntry,
  BulkOperationLogEntry,
  DashboardStats,
  ServiceStatusSnapshot,
  CodeSkuSummary,
} from '@/shared/api-types'

export type MotherAccount = MotherAccountSummary

export type UserData = InviteListItem

export type CodeData = RedeemCodeItem

export type AuditLog = AuditLogEntry

export type BulkHistoryEntry = BulkOperationLogEntry

export type StatsData = DashboardStats

export type ServiceStatus = ServiceStatusSnapshot

export interface AdminState {
  authenticated: boolean | null
  loginPassword: string
  loginLoading: boolean
  loginError: string
  showPassword: boolean
  mothers: MotherAccount[]
  mothersPage: number
  mothersPageSize: number
  mothersTotal: number
  mothersInitialized: boolean
  mothersLoading: boolean
  auditLogs: AuditLog[]
  bulkHistory: BulkHistoryEntry[]
  stats: StatsData | null
  serviceStatus: ServiceStatus
  auditPage: number
  auditPageSize: number
  auditTotal: number
  auditInitialized: boolean
  bulkHistoryPage: number
  bulkHistoryPageSize: number
  bulkHistoryTotal: number
  bulkHistoryInitialized: boolean
  loading: boolean
  statsLoading: boolean
  currentTab: string
  searchTerm: string
  filterStatus: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  autoRefresh: boolean
  error: string | null
  codeCount: number
  codePrefix: string
  codeLifecyclePlan: 'weekly' | 'monthly'
  codeSwitchLimit: number
  codeSkuSlug: string
  codeSkus: CodeSkuSummary[]
  generatedCodes: string[]
  generateLoading: boolean
  showGenerated: boolean
  codesStatusMother: string
  codesStatusTeam: string
  codesStatusBatch: string
}
