'use client'

export interface MotherAccount {
  id: number
  name: string
  status: string
  seat_limit: number
  seats_used: number
  token_expires_at?: string
  notes?: string
  teams: Array<{
    team_id: string
    team_name?: string
    is_enabled: boolean
    is_default: boolean
  }>
}

export interface UserData {
  id: number
  email: string
  status: string
  team_id?: string
  team_name?: string
  invited_at: string
  redeemed_at?: string
  code_used?: string
}

export interface CodeData {
  id: number
  code: string
  batch_id?: string
  is_used: boolean
  expires_at?: string
  created_at: string
  used_by?: string
  used_at?: string
  mother_id?: number
  mother_name?: string
  team_id?: string
  team_name?: string
  invite_status?: string
}

export interface AuditLog {
  id: number
  actor: string
  action: string
  target_type?: string | null
  target_id?: string | null
  payload_redacted?: string | null
  ip?: string | null
  ua?: string | null
  created_at?: string | null
}

export interface BulkHistoryEntry {
  id: number
  operation_type: string
  actor: string
  total_count?: number | null
  success_count?: number | null
  failed_count?: number | null
  metadata: Record<string, unknown>
  created_at?: string | null
}

export interface StatsData {
  total_codes: number
  used_codes: number
  pending_invites: number
  successful_invites: number
  total_users: number
  active_teams: number
  usage_rate: number
  recent_activity: Array<{
    date: string
    invites: number
    redemptions: number
  }>
  status_breakdown: Record<string, number>
  mother_usage: Array<{
    id: number
    name: string
    seat_limit: number
    seats_used: number
    usage_rate: number
    status: string
  }>
  enabled_teams?: number
  max_code_capacity?: number
  active_codes?: number
  remaining_code_quota?: number
}

export interface ServiceStatus {
  backend: 'online' | 'offline' | 'unknown'
  lastCheck: Date | null
}

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
  users: UserData[]
  codes: CodeData[]
  auditLogs: AuditLog[]
  bulkHistory: BulkHistoryEntry[]
  stats: StatsData | null
  serviceStatus: ServiceStatus
  usersPage: number
  usersPageSize: number
  usersTotal: number
  usersInitialized: boolean
  codesPage: number
  codesPageSize: number
  codesTotal: number
  codesInitialized: boolean
  auditPage: number
  auditPageSize: number
  auditTotal: number
  auditInitialized: boolean
  bulkHistoryPage: number
  bulkHistoryPageSize: number
  bulkHistoryTotal: number
  bulkHistoryInitialized: boolean
  loading: boolean
  usersLoading: boolean
  codesLoading: boolean
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
  generatedCodes: string[]
  generateLoading: boolean
  showGenerated: boolean
  codesStatusMother: string
  codesStatusTeam: string
  codesStatusBatch: string
}
