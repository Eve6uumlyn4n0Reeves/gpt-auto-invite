import { usersAdminRequest } from '@/lib/api/admin-client'
import type { AuditLog } from '@/store/admin-context'

export interface AuditQueryParams {
  page?: number
  page_size?: number
}

export interface AuditResponse {
  items?: AuditLog[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}

export async function fetchAuditLogs(params: AuditQueryParams) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))

  const query = search.toString()
  const endpoint = query ? `/audit-logs?${query}` : '/audit-logs'

  return usersAdminRequest<AuditResponse>(endpoint)
}
