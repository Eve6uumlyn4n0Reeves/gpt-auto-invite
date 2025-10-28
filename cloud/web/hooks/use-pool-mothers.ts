'use client'

import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMothers } from '@/lib/api/mothers'
import { usePoolActions, usePoolSelector } from '@/store/pool/context'

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

  const mothersQuery = useQuery({
    queryKey: mothersQueryKey(state.mothersPage, state.mothersPageSize, currentSearch),
    queryFn: () => fetcher(state.mothersPage, state.mothersPageSize, currentSearch),
  })

  useEffect(() => {
    actions.setMothersLoading(mothersQuery.isFetching)
  }, [actions, mothersQuery.isFetching])

  useEffect(() => {
    if (mothersQuery.isSuccess) {
      const items = Array.isArray(mothersQuery.data?.items) ? mothersQuery.data!.items : []
      actions.setMothers(items as any)
      const total = typeof mothersQuery.data?.pagination?.total === 'number' ? mothersQuery.data!.pagination!.total! : items.length
      actions.setMothersTotal(total)
      actions.setMothersInitialized(true)
    }
  }, [actions, mothersQuery.isSuccess, mothersQuery.data])

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

