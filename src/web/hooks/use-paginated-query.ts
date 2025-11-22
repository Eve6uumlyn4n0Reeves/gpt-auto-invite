import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

export interface PaginationMeta {
  page?: number
  page_size?: number
  total?: number
}

export interface PaginatedResponse<T> {
  items?: T[]
  pagination?: PaginationMeta
}

export interface UsePaginatedQueryParams<T> {
  key: readonly unknown[]
  page: number
  pageSize: number
  enabled?: boolean
  fetchPage: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>
}

export function usePaginatedQuery<T>(params: UsePaginatedQueryParams<T>): {
  query: UseQueryResult<PaginatedResponse<T>>
  items: T[]
  total: number
} {
  const { key, page, pageSize, enabled = true, fetchPage } = params

  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: () => fetchPage(page, pageSize),
  })

  const items = useMemo(() => (Array.isArray(query.data?.items) ? (query.data!.items as T[]) : []), [query.data])
  const total = useMemo(() => query.data?.pagination?.total ?? items.length, [query.data, items.length])

  return { query, items, total }
}

