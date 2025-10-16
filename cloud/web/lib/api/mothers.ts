import { adminRequest } from '@/lib/api/admin-client'
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

  return adminRequest<MothersResponse>(endpoint)
}
