import { adminRequest } from '@/lib/api/admin-client'
import type { BulkHistoryEntry } from '@/store/admin-context'

export interface BulkHistoryQueryParams {
  page?: number
  page_size?: number
}

export interface BulkHistoryResponse {
  items?: BulkHistoryEntry[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}

export async function fetchBulkHistory(params: BulkHistoryQueryParams) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))

  const query = search.toString()
  const endpoint = query ? `/bulk/history?${query}` : '/bulk/history'

  return adminRequest<BulkHistoryResponse>(endpoint)
}
