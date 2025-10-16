import { adminRequest } from '@/lib/api/admin-client'
import type { UserData } from '@/store/admin-context'

export interface UsersQueryParams {
  page?: number
  page_size?: number
  status?: string
  search?: string
}

export interface UsersResponse {
  items?: UserData[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}

export async function fetchUsers(params: UsersQueryParams) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  if (params.status && params.status !== 'all') search.set('status', params.status)
  if (params.search?.trim()) search.set('search', params.search.trim())

  const query = search.toString()
  const endpoint = query ? `/users?${query}` : '/users'

  return adminRequest<UsersResponse>(endpoint)
}
