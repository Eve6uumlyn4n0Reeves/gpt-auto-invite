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
