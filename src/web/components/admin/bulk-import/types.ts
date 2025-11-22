import type { TeamFormInput } from '@/types/admin'

export type ImportStage = 'idle' | 'preview' | 'validated' | 'completed'

export type BulkEntryStatus = 'draft' | 'validated' | 'invalid' | 'imported' | 'failed'

export interface BulkMotherEntry {
  id: string
  source: 'manual' | 'upload'
  name: string
  access_token: string
  token_expires_at?: string | null
  notes?: string
  teams: TeamFormInput[]
  warnings: string[]
  valid: boolean | null
  status: BulkEntryStatus
  error?: string
  updatedAt: number
}

export interface BulkMotherImportProps {
  onRefreshMothers: () => void
  onRefreshStats: () => void
  onRefreshQuota?: () => void
  onRefreshHistory?: () => void
}

export interface DuplicateInfo {
  duplicateNames: Set<string>
  duplicateTokens: Set<string>
}

export interface ImportSummary {
  success: number
  failed: number
}
