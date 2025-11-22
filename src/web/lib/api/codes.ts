import { usersAdminRequest } from '@/lib/api/admin-client'
import type { CodeData } from '@/store/admin-context'
import type { CodeStatus, CodeSkuSummary, PaginatedResponse } from '@/shared/api-types'

export interface CodesQueryParams {
  page?: number
  page_size?: number
  status?: CodeStatus | 'all'
  search?: string
}

export type CodesResponse = PaginatedResponse<CodeData>

export async function fetchCodes(params: CodesQueryParams) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  if (params.status && params.status !== 'all') search.set('status', params.status)
  if (params.search?.trim()) search.set('search', params.search.trim())

  const query = search.toString()
  const endpoint = query ? `/codes?${query}` : '/codes'

  return usersAdminRequest<CodesResponse>(endpoint)
}

export interface GenerateCodesPayload {
  count: number
  prefix?: string
  lifecycle_plan?: 'weekly' | 'monthly'
  switch_limit?: number
  sku_slug: string
}

export async function generateCodes(payload: GenerateCodesPayload) {
  return usersAdminRequest<{ codes: string[] }>('/codes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchCodeSkus(includeInactive = true) {
  const query = includeInactive ? '?include_inactive=true' : ''
  return usersAdminRequest<CodeSkuSummary[]>(`/codes/skus${query}`)
}

export interface CodeSkuPayload {
  name: string
  slug?: string
  description?: string | null
  lifecycle_days: number
  default_refresh_limit?: number | null
  price_cents?: number | null
  is_active: boolean
}

export async function createCodeSku(payload: CodeSkuPayload) {
  return usersAdminRequest<CodeSkuSummary>('/codes/skus', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateCodeSku(id: number, payload: Partial<CodeSkuPayload>) {
  return usersAdminRequest<CodeSkuSummary>(`/codes/skus/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
