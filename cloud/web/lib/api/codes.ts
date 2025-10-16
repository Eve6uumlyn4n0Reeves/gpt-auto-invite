import { adminRequest } from '@/lib/api/admin-client'
import type { CodeData } from '@/store/admin-context'

export interface CodesQueryParams {
  page?: number
  page_size?: number
  status?: string
  search?: string
}

export interface CodesResponse {
  items?: CodeData[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}

export async function fetchCodes(params: CodesQueryParams) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  if (params.status && params.status !== 'all') search.set('status', params.status)
  if (params.search?.trim()) search.set('search', params.search.trim())

  const query = search.toString()
  const endpoint = query ? `/codes?${query}` : '/codes'

  return adminRequest<CodesResponse>(endpoint)
}

export interface GenerateCodesPayload {
  count: number
  prefix?: string
}

export async function generateCodes(payload: GenerateCodesPayload) {
  return adminRequest<{ codes: string[] }>('/codes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
