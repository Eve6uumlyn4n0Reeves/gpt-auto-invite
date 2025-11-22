import { poolAdminRequest } from '@/lib/api/admin-client'
import { type PoolGroupSummary } from '@/shared/api-types'

export interface TeamInfo {
  valid: boolean
  email?: string
  team_id?: string
  expires_at?: string
  has_token?: boolean
  error?: string
  error_type?: string
}

export type PoolGroup = PoolGroupSummary

export interface AutoIngestTemplate {
  pool_groups: PoolGroupSummary[]
  usage_notes: {
    cookie_source: string
    pool_group_selection: string
    auto_creation: string
  }
}

export interface AutoIngestRequest {
  cookie_string: string
  pool_group_id?: number
  pool_group_name?: string
}

export interface AutoIngestResponse {
  success: boolean
  mother?: {
    id: number
    name: string
    email: string
    team_id: string
    pool_group_id?: number
    pool_group_name?: string
  }
  team?: {
    team_id: string
    team_name?: string
    is_enabled: boolean
    is_default: boolean
  }
  processed_at?: string
  error?: string
  error_type?: string
}

export class AutoIngestApi {
  async getCurrentTeamInfo(cookieString: string): Promise<TeamInfo> {
    const endpoint = `/auto-ingest/current-team?cookie_string=${encodeURIComponent(cookieString)}`
    const res = await poolAdminRequest<TeamInfo>(endpoint)
    if (!('ok' in res) || !res.ok) {
      throw new Error(res.error || '获取团队信息失败')
    }
    return res.data as TeamInfo
  }

  async getTemplates(): Promise<AutoIngestTemplate> {
    const res = await poolAdminRequest<AutoIngestTemplate>('/auto-ingest/templates')
    if (!('ok' in res) || !res.ok) {
      throw new Error(res.error || '获取模板失败')
    }
    return res.data as AutoIngestTemplate
  }

  async ingestMother(data: AutoIngestRequest): Promise<AutoIngestResponse> {
    const res = await poolAdminRequest<AutoIngestResponse>('/auto-ingest', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!('ok' in res) || !res.ok) {
      throw new Error(res.error || '自动录入失败')
    }
    return res.data as AutoIngestResponse
  }
}

export const autoIngestApi = new AutoIngestApi()
