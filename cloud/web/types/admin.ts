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
}
