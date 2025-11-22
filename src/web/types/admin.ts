export interface TeamFormInput {
  team_id: string
  team_name?: string
  is_enabled: boolean
  is_default: boolean
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

export interface QuotaSnapshot {
  total_codes: number
  used_codes: number
  active_codes: number
  max_code_capacity: number
  remaining_quota: number
  used_seats: number
  pending_invites: number
  generated_at: string
  alive_mothers?: number
  capacity_warn?: boolean
}

export interface ImportCookieResult {
  access_token: string
  token_expires_at?: string | null
  user_email?: string | null
  account_id?: string | null
}

export interface PerformanceOperationMetrics {
  count?: number
  total_time_ms?: number
  avg_time_ms?: number
}

export interface PerformanceSlowQuery {
  query: string
  duration_ms: number
  last_executed_at?: string | null
}

export interface PerformanceStatsResponse {
  total_operations: number
  operations: Record<string, PerformanceOperationMetrics>
  slow_queries: PerformanceSlowQuery[]
  enabled: boolean
}
