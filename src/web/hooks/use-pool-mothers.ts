'use client'

import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchMothers } from '@/lib/api/mothers'
import { usePoolActions, usePoolSelector } from '@/domains/pool/store'
import { usePaginatedQuery } from '@/hooks/use-paginated-query'

const mothersQueryKey = (page: number, pageSize: number, search: string) => ['pool', 'mothers', page, pageSize, search] as const

export const usePoolMothers = () => {
  const state = usePoolSelector((s) => s)
  const actions = usePoolActions()
  const qc = useQueryClient()

  const currentSearch = '' // 号池母号页当前不依赖全局搜索；如需可接入独立搜索状态

  const fetcher = useCallback(async (page: number, pageSize: number, search: string) => {
    const res = await fetchMothers({ page, page_size: pageSize, search })
    if (!('ok' in res) || !res.ok) {
      const msg = res.error || '加载母号失败'
      const err: any = new Error(msg)
      err.status = res.response?.status
      throw err
    }
    return res.data ?? { items: [], pagination: {} }
  }, [])

  const { query: mothersQuery, items: mothersItems, total: mothersTotal } = usePaginatedQuery({
    key: mothersQueryKey(state.mothersPage, state.mothersPageSize, currentSearch),
    page: state.mothersPage,
    pageSize: state.mothersPageSize,
    fetchPage: (page, size) => fetcher(page, size, currentSearch),
  })

  useEffect(() => {
    actions.setMothersLoading(mothersQuery.isFetching)
  }, [actions, mothersQuery.isFetching])

  useEffect(() => {
    if (mothersQuery.isSuccess) {
      actions.setMothers(mothersItems as any)
      actions.setMothersTotal(mothersTotal)
      actions.setMothersInitialized(true)
    }
  }, [actions, mothersItems, mothersQuery.isSuccess, mothersTotal])

  const loadMothers = useCallback(async (opts?: { page?: number; pageSize?: number; search?: string }) => {
    const page = opts?.page ?? state.mothersPage
    const size = opts?.pageSize ?? state.mothersPageSize
    const search = opts?.search ?? currentSearch
    if (opts?.page != null) actions.setMothersPage(page)
    if (opts?.pageSize != null) actions.setMothersPageSize(size)
    const data = await qc.fetchQuery({ queryKey: mothersQueryKey(page, size, search), queryFn: () => fetcher(page, size, search) })
    const items = Array.isArray(data?.items) ? data.items : []
    const total = typeof data?.pagination?.total === 'number' ? data!.pagination!.total! : items.length
    actions.setMothers(items as any)
    actions.setMothersTotal(total)
    actions.setMothersInitialized(true)
    return { success: true, data: { items, total } }
  }, [actions, fetcher, qc, state.mothersPage, state.mothersPageSize])

  return { loadMothers }
}
