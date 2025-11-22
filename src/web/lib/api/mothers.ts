import { poolAdminRequest } from '@/lib/api/admin-client'
import type { MotherAccount } from '@/store/admin-context'

export interface MothersQueryParams {
  page?: number
  page_size?: number
  search?: string
}

export interface MothersResponse {
  items?: MotherAccount[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}

export async function fetchMothers(params: MothersQueryParams) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  if (params.search?.trim()) search.set('search', params.search.trim())

  const query = search.toString()
  const endpoint = query ? `/mothers?${query}` : '/mothers'

  return poolAdminRequest<MothersResponse>(endpoint)
}

// --- Children APIs (Pool domain) ---
export async function fetchChildren(motherId: number) {
  return poolAdminRequest<{ items: Array<{
    id: number
    child_id: string
    name: string
    email: string
    team_id: string
    team_name: string
    status: string
    member_id?: string | null
    created_at: string
  }> }>(`/mothers/${motherId}/children`)
}

export async function autoPullChildren(motherId: number) {
  return poolAdminRequest<{ ok: true; created_count: number }>(`/mothers/${motherId}/children/auto-pull`, { method: 'POST' })
}

export async function syncChildren(motherId: number) {
  return poolAdminRequest<{ ok: true; synced_count: number; error_count: number; message: string }>(`/mothers/${motherId}/children/sync`, { method: 'POST' })
}

export async function removeChild(childId: number) {
  return poolAdminRequest<{ ok: true }>(`/children/${childId}`, { method: 'DELETE' })
}

// Admin mother CRUD
type MotherTeamInput = { team_id: string; team_name?: string; is_enabled: boolean; is_default: boolean }

export interface MotherCreatePayload {
  name: string
  seat_limit?: number
  notes?: string
  teams?: MotherTeamInput[]
  access_token?: string
  token_expires_at?: string | null
}

export type MotherUpdatePayload = Partial<MotherCreatePayload>

export async function createMother(payload: MotherCreatePayload) {
  return poolAdminRequest<{ id: number }>(`/mothers`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateMother(motherId: number, payload: MotherUpdatePayload) {
  return poolAdminRequest<{ ok: true }>(`/mothers/${motherId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteMother(motherId: number) {
  return poolAdminRequest<{ ok: true }>(`/mothers/${motherId}`, { method: 'DELETE' })
}

// Mother 详情（含 seats 摘要），用于需要席位明细的场景统一获取
export interface MotherSeatSummaryOut {
  slot_index: number
  team_id?: string | null
  email?: string | null
  status: string
  held_until?: string | null
  invite_request_id?: number | null
  invite_id?: string | null
  member_id?: string | null
}

export interface MotherDetailOut {
  id: number
  name: string
  status: string
  seat_limit: number
  teams: Array<{ team_id: string; team_name?: string; is_enabled: boolean; is_default: boolean }>
  children: Array<{ child_id: string; email: string; team_id: string; team_name: string; status: string; member_id?: string | null; created_at: string }>
  seats: MotherSeatSummaryOut[]
  seats_in_use: number
  seats_available: number
  created_at: string
  updated_at: string
}

export async function fetchMotherDetail(motherId: number) {
  // 后端返回 ApiResponse 格式：{ success, message, data }
  return poolAdminRequest<{ success: boolean; message?: string; data?: MotherDetailOut }>(`/mothers/${motherId}`)
}
