'use client'

import { useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminRequest } from '@/lib/api/admin-client'
import { MSG } from '@/messages'
import { fetchMothers } from '@/lib/api/mothers'
import { fetchUsers } from '@/lib/api/users'
import { fetchCodes, generateCodes as requestGenerateCodes } from '@/lib/api/codes'
import { fetchAuditLogs } from '@/lib/api/audit'
import { fetchBulkHistory } from '@/lib/api/bulk-history'
import {
  useAdminSelector,
  useAdminActions,
  type MotherAccount,
  type UserData,
  type CodeData,
  type AuditLog,
  type BulkHistoryEntry,
  type StatsData,
} from '@/store/admin-context'
import { useErrorNotifier } from '@/hooks/use-error-notifier'

interface ApiError extends Error {
  status?: number
}

const createApiError = (message: string, status?: number): ApiError => {
  const error = new Error(message) as ApiError
  error.status = status
  return error
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const getErrorStatus = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'status' in error ? (error as ApiError).status : undefined

const extractPagination = (
  pagination: { page?: number; page_size?: number; total?: number } | undefined,
  defaultPage: number,
  defaultPageSize: number,
  fallbackTotal: number,
) => ({
  page: typeof pagination?.page === 'number' ? pagination.page : defaultPage,
  page_size: typeof pagination?.page_size === 'number' ? pagination.page_size : defaultPageSize,
  total: typeof pagination?.total === 'number' ? pagination.total : fallbackTotal,
})

const mothersQueryKey = (page: number, pageSize: number, search: string) => [
  'admin',
  'mothers',
  page,
  pageSize,
  search,
] as const

const usersQueryKey = (page: number, pageSize: number, status: string, search: string) => [
  'admin',
  'users',
  page,
  pageSize,
  status,
  search,
] as const

const codesQueryKey = (page: number, pageSize: number, status: string, search: string) => [
  'admin',
  'codes',
  page,
  pageSize,
  status,
  search,
] as const

const auditQueryKey = (page: number, pageSize: number) => ['admin', 'audit', page, pageSize] as const

const bulkHistoryQueryKey = (page: number, pageSize: number) => ['admin', 'bulk-history', page, pageSize] as const

const statsQueryKey = ['admin', 'stats'] as const

export const useAdminSimple = () => {
  const state = useAdminSelector((s) => s)
  const actions = useAdminActions()
  const queryClient = useQueryClient()
  const { notifyError } = useErrorNotifier()

  const currentSearch = state.searchTerm.trim()

  const mothersFetch = useCallback(
    async (page: number, pageSize: number, search: string) => {
      const result = await fetchMothers({ page, page_size: pageSize, search })
      if (!('ok' in result) || !result.ok) {
        throw createApiError(result.error || MSG.errors.loadMothers, result.response.status)
      }
      return result.data ?? { items: [], pagination: {} }
    },
    [],
  )

  const usersFetch = useCallback(
    async (page: number, pageSize: number, status: string, search: string) => {
      const result = await fetchUsers({ page, page_size: pageSize, status, search })
      if (!('ok' in result) || !result.ok) {
        throw createApiError(result.error || MSG.errors.loadUsers, result.response.status)
      }
      return result.data ?? { items: [], pagination: {} }
    },
    [],
  )

  const codesFetch = useCallback(
    async (page: number, pageSize: number, status: string, search: string) => {
      const result = await fetchCodes({ page, page_size: pageSize, status, search })
      if (!('ok' in result) || !result.ok) {
        throw createApiError(result.error || MSG.errors.loadCodes, result.response.status)
      }
      return result.data ?? { items: [], pagination: {} }
    },
    [],
  )

  const auditFetch = useCallback(
    async (page: number, pageSize: number) => {
      const result = await fetchAuditLogs({ page, page_size: pageSize })
      if (!('ok' in result) || !result.ok) {
        throw createApiError(result.error || MSG.errors.loadAudit, result.response.status)
      }
      return result.data ?? { items: [], pagination: {} }
    },
    [],
  )

  const bulkHistoryFetch = useCallback(
    async (page: number, pageSize: number) => {
      const result = await fetchBulkHistory({ page, page_size: pageSize })
      if (!('ok' in result) || !result.ok) {
        throw createApiError(result.error || MSG.errors.loadBulkHistory, result.response.status)
      }
      return result.data ?? { items: [], pagination: {} }
    },
    [],
  )

  const statsQuery = useQuery({
    queryKey: statsQueryKey,
    enabled: state.authenticated === true,
    queryFn: async () => {
      const result = await adminRequest<StatsData>('/stats')
      if (!('ok' in result) || !result.ok) {
        throw createApiError(result.error || '加载统计数据失败', result.response.status)
      }
      return result.data ?? null
    },
  })

  useEffect(() => {
    actions.setStatsLoading(statsQuery.isFetching)
  }, [actions, statsQuery.isFetching])

  useEffect(() => {
    if (statsQuery.isSuccess) {
      actions.setStats(statsQuery.data)
      actions.setServiceStatus({ backend: 'online', lastCheck: new Date() })
    }
  }, [actions, statsQuery.isSuccess, statsQuery.data])

  useEffect(() => {
    if (statsQuery.isError) {
      const status = getErrorStatus(statsQuery.error)
      if (status === 502 || status === 503) {
        actions.setServiceStatus({ backend: 'offline', lastCheck: new Date() })
      }
      actions.setStats(null)
    }
  }, [actions, statsQuery.isError, statsQuery.error])

  const mothersQuery = useQuery({
    queryKey: mothersQueryKey(state.mothersPage, state.mothersPageSize, currentSearch),
    enabled: state.authenticated === true,
    // v5: keepPreviousData removed; default caching is sufficient
    queryFn: () => mothersFetch(state.mothersPage, state.mothersPageSize, currentSearch),
  })

  useEffect(() => {
    actions.setMothersLoading(mothersQuery.isFetching)
  }, [actions, mothersQuery.isFetching])

  useEffect(() => {
    if (mothersQuery.isSuccess) {
      const items = Array.isArray(mothersQuery.data?.items) ? mothersQuery.data!.items : []
      const validated = items.map((mother) => ({
        ...mother,
        seat_limit: Math.min(mother.seat_limit || 7, 7),
      }))
      const pagination = extractPagination(
        mothersQuery.data?.pagination,
        state.mothersPage,
        state.mothersPageSize,
        validated.length,
      )

      actions.setMothers(validated)
      actions.setMothersTotal(pagination.total)
      if (pagination.page !== state.mothersPage) {
        actions.setMothersPage(pagination.page)
      }
      if (pagination.page_size !== state.mothersPageSize) {
        actions.setMothersPageSize(pagination.page_size)
      }
      actions.setMothersInitialized(true)
    }
  }, [actions, mothersQuery.isSuccess, mothersQuery.data, state.mothersPage, state.mothersPageSize])

  useEffect(() => {
    if (mothersQuery.isError) {
      notifyError(mothersQuery.error, '加载母账号失败')
      actions.setMothers([])
      actions.setMothersTotal(0)
      actions.setMothersInitialized(true)
    }
  }, [actions, mothersQuery.isError, mothersQuery.error, notifyError])

  const usersQuery = useQuery({
    queryKey: usersQueryKey(state.usersPage, state.usersPageSize, state.filterStatus, currentSearch),
    enabled: state.authenticated === true,
    // v5: keepPreviousData removed
    queryFn: () => usersFetch(state.usersPage, state.usersPageSize, state.filterStatus, currentSearch),
  })

  // Deprecated: users loading handled locally in view-model via React Query

  useEffect(() => {
    if (usersQuery.isSuccess) {
      const pagination = extractPagination(
        usersQuery.data?.pagination,
        state.usersPage,
        state.usersPageSize,
        Array.isArray(usersQuery.data?.items) ? usersQuery.data!.items.length : 0,
      )
      if (pagination.page !== state.usersPage) {
        actions.setUsersPage(pagination.page)
      }
      if (pagination.page_size !== state.usersPageSize) {
        actions.setUsersPageSize(pagination.page_size)
      }
    }
  }, [actions, usersQuery.isSuccess, usersQuery.data, state.usersPage, state.usersPageSize])

  useEffect(() => {
    if (usersQuery.isError) {
      notifyError(usersQuery.error, MSG.errors.loadUsers)
    }
  }, [usersQuery.isError, usersQuery.error, notifyError])

  const codesQuery = useQuery({
    queryKey: codesQueryKey(state.codesPage, state.codesPageSize, state.filterStatus, currentSearch),
    enabled: state.authenticated === true,
    // v5: keepPreviousData removed
    queryFn: () => codesFetch(state.codesPage, state.codesPageSize, state.filterStatus, currentSearch),
  })

  // Deprecated: codes loading handled locally in view-model via React Query

  useEffect(() => {
    if (codesQuery.isSuccess) {
      const pagination = extractPagination(
        codesQuery.data?.pagination,
        state.codesPage,
        state.codesPageSize,
        Array.isArray(codesQuery.data?.items) ? codesQuery.data!.items.length : 0,
      )
      if (pagination.page !== state.codesPage) {
        actions.setCodesPage(pagination.page)
      }
      if (pagination.page_size !== state.codesPageSize) {
        actions.setCodesPageSize(pagination.page_size)
      }
    }
  }, [actions, codesQuery.isSuccess, codesQuery.data, state.codesPage, state.codesPageSize])

  useEffect(() => {
    if (codesQuery.isError) {
      notifyError(codesQuery.error, MSG.errors.loadCodes)
    }
  }, [codesQuery.isError, codesQuery.error, notifyError])

  const auditQuery = useQuery({
    queryKey: auditQueryKey(state.auditPage, state.auditPageSize),
    enabled: state.authenticated === true,
    // v5: keepPreviousData removed
    queryFn: () => auditFetch(state.auditPage, state.auditPageSize),
  })

  useEffect(() => {
    if (auditQuery.isSuccess) {
      const items = Array.isArray(auditQuery.data?.items) ? auditQuery.data!.items : []
      const pagination = extractPagination(
        auditQuery.data?.pagination,
        state.auditPage,
        state.auditPageSize,
        items.length,
      )

      actions.setAuditLogs(items)
      actions.setAuditTotal(pagination.total)
      if (pagination.page !== state.auditPage) {
        actions.setAuditPage(pagination.page)
      }
      if (pagination.page_size !== state.auditPageSize) {
        actions.setAuditPageSize(pagination.page_size)
      }
      actions.setAuditInitialized(true)
    }
  }, [actions, auditQuery.isSuccess, auditQuery.data, state.auditPage, state.auditPageSize])

  useEffect(() => {
    if (auditQuery.isError) {
      notifyError(auditQuery.error, MSG.errors.loadAudit)
      actions.setAuditLogs([])
      actions.setAuditTotal(0)
      actions.setAuditInitialized(true)
    }
  }, [actions, auditQuery.isError, auditQuery.error, notifyError])

  const bulkHistoryQuery = useQuery({
    queryKey: bulkHistoryQueryKey(state.bulkHistoryPage, state.bulkHistoryPageSize),
    enabled: state.authenticated === true,
    // v5: keepPreviousData removed
    queryFn: () => bulkHistoryFetch(state.bulkHistoryPage, state.bulkHistoryPageSize),
  })

  useEffect(() => {
    if (bulkHistoryQuery.isSuccess) {
      const items = Array.isArray(bulkHistoryQuery.data?.items) ? bulkHistoryQuery.data!.items : []
      const pagination = extractPagination(
        bulkHistoryQuery.data?.pagination,
        state.bulkHistoryPage,
        state.bulkHistoryPageSize,
        items.length,
      )

      actions.setBulkHistory(items)
      actions.setBulkHistoryTotal(pagination.total)
      if (pagination.page !== state.bulkHistoryPage) {
        actions.setBulkHistoryPage(pagination.page)
      }
      if (pagination.page_size !== state.bulkHistoryPageSize) {
        actions.setBulkHistoryPageSize(pagination.page_size)
      }
      actions.setBulkHistoryInitialized(true)
    }
  }, [
    actions,
    bulkHistoryQuery.isSuccess,
    bulkHistoryQuery.data,
    state.bulkHistoryPage,
    state.bulkHistoryPageSize,
  ])

  useEffect(() => {
    if (bulkHistoryQuery.isError) {
      notifyError(bulkHistoryQuery.error, MSG.errors.loadBulkHistory)
      actions.setBulkHistory([])
      actions.setBulkHistoryTotal(0)
      actions.setBulkHistoryInitialized(true)
    }
  }, [actions, bulkHistoryQuery.isError, bulkHistoryQuery.error, notifyError])

  const logout = useCallback(async () => {
    try {
      await adminRequest('/logout', { method: 'POST', skipJson: true })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      actions.resetAuth()
      actions.resetData()
      queryClient.clear()
    }
  }, [actions, queryClient])

  const checkAuth = useCallback(async () => {
    try {
      const result = await adminRequest<{ authenticated: boolean }>('/me')
      if (!('ok' in result) || !result.ok) {
        actions.setAuthenticated(false)
        return false
      }
      const isAuthenticated = Boolean(result.data?.authenticated)
      actions.setAuthenticated(isAuthenticated)
      if (isAuthenticated) {
        await queryClient.invalidateQueries({ queryKey: ['admin'] })
      }
      return isAuthenticated
    } catch (error) {
      console.error('Auth check error:', error)
      actions.setAuthenticated(false)
      return false
    }
  }, [actions, queryClient])

  const login = useCallback(
    async (password: string) => {
      actions.setLoginLoading(true)
      actions.setLoginError('')

      try {
        const result = await adminRequest<{ success?: boolean }>('/login', {
          method: 'POST',
          body: JSON.stringify({ password }),
        })

        if (!('ok' in result) || !result.ok) {
          const errorMessage = result.error || '密码错误'
          actions.setLoginError(errorMessage)
          return { success: false, error: errorMessage }
        }

        actions.setAuthenticated(true)
        actions.setLoginPassword('')
        await queryClient.invalidateQueries({ queryKey: ['admin'] })
        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '登录失败，请稍后重试'
        actions.setLoginError(errorMessage)
        return { success: false, error: errorMessage }
      } finally {
        actions.setLoginLoading(false)
      }
    },
    [actions, queryClient],
  )

  const loadStats = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: statsQueryKey })
  }, [queryClient])

  const loadMothers = useCallback(
    async (options?: { page?: number; pageSize?: number; search?: string }) => {
      const nextPage = options?.page ?? state.mothersPage
      const nextPageSize = options?.pageSize ?? state.mothersPageSize
      const nextSearch = options?.search ?? currentSearch

      if (options?.page !== undefined && options.page !== state.mothersPage) {
        actions.setMothersPage(options.page)
      }
      if (options?.pageSize !== undefined && options.pageSize !== state.mothersPageSize) {
        actions.setMothersPageSize(options.pageSize)
      }
      if (options?.search !== undefined && options.search !== currentSearch) {
        actions.setSearchTerm(options.search)
      }

      try {
        const data = await queryClient.fetchQuery({
          queryKey: mothersQueryKey(nextPage, nextPageSize, nextSearch),
          queryFn: () => mothersFetch(nextPage, nextPageSize, nextSearch),
        })

        const items = Array.isArray(data?.items) ? data.items : []
        const validated = items.map((mother) => ({
          ...mother,
          seat_limit: Math.min(mother.seat_limit || 7, 7),
        }))
        const pagination = extractPagination(data?.pagination, nextPage, nextPageSize, validated.length)

        actions.setMothers(validated)
        actions.setMothersTotal(pagination.total)
        actions.setMothersInitialized(true)

        return {
          success: true,
          data: {
            items: validated,
            pagination,
          },
        }
      } catch (error) {
        const message = getErrorMessage(error, MSG.errors.loadMothers)
        actions.setError(message)
        return { success: false, error: message }
      }
    },
    [
      actions,
      currentSearch,
      mothersFetch,
      queryClient,
      state.mothersPage,
      state.mothersPageSize,
    ],
  )

  const loadUsers = useCallback(
    async (options?: { page?: number; pageSize?: number; status?: string; search?: string }) => {
      const nextPage = options?.page ?? state.usersPage
      const nextPageSize = options?.pageSize ?? state.usersPageSize
      const nextStatus = options?.status ?? state.filterStatus
      const nextSearch = options?.search ?? currentSearch

      if (options?.page !== undefined && options.page !== state.usersPage) {
        actions.setUsersPage(options.page)
      }
      if (options?.pageSize !== undefined && options.pageSize !== state.usersPageSize) {
        actions.setUsersPageSize(options.pageSize)
      }
      if (options?.status !== undefined && options.status !== state.filterStatus) {
        actions.setFilterStatus(options.status)
      }
      if (options?.search !== undefined && options.search !== currentSearch) {
        actions.setSearchTerm(options.search)
      }

      try {
        const data = await queryClient.fetchQuery({
          queryKey: usersQueryKey(nextPage, nextPageSize, nextStatus, nextSearch),
          queryFn: () => usersFetch(nextPage, nextPageSize, nextStatus, nextSearch),
        })

        const items = Array.isArray(data?.items) ? data.items : []
        const pagination = extractPagination(data?.pagination, nextPage, nextPageSize, items.length)

        return {
          success: true,
          data: {
            items,
            pagination,
          },
        }
      } catch (error) {
        const message = getErrorMessage(error, MSG.errors.loadUsers)
        actions.setError(message)
        return { success: false, error: message }
      }
    },
    [
      actions,
      currentSearch,
      queryClient,
      state.filterStatus,
      state.usersPage,
      state.usersPageSize,
      usersFetch,
    ],
  )

  const loadCodes = useCallback(
    async (options?: { page?: number; pageSize?: number; status?: string; search?: string }) => {
      const nextPage = options?.page ?? state.codesPage
      const nextPageSize = options?.pageSize ?? state.codesPageSize
      const nextStatus = options?.status ?? state.filterStatus
      const nextSearch = options?.search ?? currentSearch

      if (options?.page !== undefined && options.page !== state.codesPage) {
        actions.setCodesPage(options.page)
      }
      if (options?.pageSize !== undefined && options.pageSize !== state.codesPageSize) {
        actions.setCodesPageSize(options.pageSize)
      }
      if (options?.status !== undefined && options.status !== state.filterStatus) {
        actions.setFilterStatus(options.status)
      }
      if (options?.search !== undefined && options.search !== currentSearch) {
        actions.setSearchTerm(options.search)
      }

      try {
        const data = await queryClient.fetchQuery({
          queryKey: codesQueryKey(nextPage, nextPageSize, nextStatus, nextSearch),
          queryFn: () => codesFetch(nextPage, nextPageSize, nextStatus, nextSearch),
        })

        const items = Array.isArray(data?.items) ? data.items : []
        const pagination = extractPagination(data?.pagination, nextPage, nextPageSize, items.length)

        return {
          success: true,
          data: {
            items,
            pagination,
          },
        }
      } catch (error) {
        const message = getErrorMessage(error, MSG.errors.loadCodes)
        actions.setError(message)
        return { success: false, error: message }
      }
    },
    [
      actions,
      codesFetch,
      currentSearch,
      queryClient,
      state.codesPage,
      state.codesPageSize,
      state.filterStatus,
    ],
  )

  const loadAuditLogs = useCallback(
    async (options?: { page?: number; pageSize?: number }) => {
      const nextPage = options?.page ?? state.auditPage
      const nextPageSize = options?.pageSize ?? state.auditPageSize

      if (options?.page !== undefined && options.page !== state.auditPage) {
        actions.setAuditPage(options.page)
      }
      if (options?.pageSize !== undefined && options.pageSize !== state.auditPageSize) {
        actions.setAuditPageSize(options.pageSize)
      }

      try {
        const data = await queryClient.fetchQuery({
          queryKey: auditQueryKey(nextPage, nextPageSize),
          queryFn: () => auditFetch(nextPage, nextPageSize),
        })

        const items = Array.isArray(data?.items) ? data.items : []
        const pagination = extractPagination(data?.pagination, nextPage, nextPageSize, items.length)

        actions.setAuditLogs(items)
        actions.setAuditTotal(pagination.total)
        actions.setAuditInitialized(true)

        return {
          success: true,
          data: {
            items,
            pagination,
          },
        }
      } catch (error) {
        const message = getErrorMessage(error, MSG.errors.loadAudit)
        actions.setError(message)
        return { success: false, error: message }
      }
    },
    [actions, auditFetch, queryClient, state.auditPage, state.auditPageSize],
  )

  const loadBulkHistory = useCallback(
    async (options?: { force?: boolean; page?: number; pageSize?: number }) => {
      const nextPage = options?.page ?? state.bulkHistoryPage
      const nextPageSize = options?.pageSize ?? state.bulkHistoryPageSize

      if (options?.page !== undefined && options.page !== state.bulkHistoryPage) {
        actions.setBulkHistoryPage(options.page)
      }
      if (options?.pageSize !== undefined && options.pageSize !== state.bulkHistoryPageSize) {
        actions.setBulkHistoryPageSize(options.pageSize)
      }

      if (!options?.force && state.bulkHistoryInitialized) {
        return {
          success: true,
          data: {
            items: state.bulkHistory,
            pagination: {
              page: state.bulkHistoryPage,
              page_size: state.bulkHistoryPageSize,
              total: state.bulkHistoryTotal,
            },
          },
        }
      }

      try {
        const data = await queryClient.fetchQuery({
          queryKey: bulkHistoryQueryKey(nextPage, nextPageSize),
          queryFn: () => bulkHistoryFetch(nextPage, nextPageSize),
        })

        const items = Array.isArray(data?.items) ? data.items : []
        const pagination = extractPagination(data?.pagination, nextPage, nextPageSize, items.length)

        actions.setBulkHistory(items)
        actions.setBulkHistoryTotal(pagination.total)
        actions.setBulkHistoryInitialized(true)

        return {
          success: true,
          data: {
            items,
            pagination,
          },
        }
      } catch (error) {
        const message = getErrorMessage(error, MSG.errors.loadBulkHistory)
        actions.setError(message)
        return { success: false, error: message }
      }
    },
    [
      actions,
      bulkHistoryFetch,
      queryClient,
      state.bulkHistory,
      state.bulkHistoryInitialized,
      state.bulkHistoryPage,
      state.bulkHistoryPageSize,
      state.bulkHistoryTotal,
    ],
  )

  const generateCodesMutation = useMutation({
    mutationFn: ({ count, prefix }: { count: number; prefix?: string }) =>
      requestGenerateCodes({ count, prefix }),
    onMutate: () => {
      actions.setGenerateLoading(true)
      actions.setError(null)
    },
    onSuccess: async (result) => {
      if (!('ok' in result) || !result.ok) {
        throw createApiError(result.error || MSG.errors.generateCodes, result.response.status)
      }
      const codes = result.data?.codes ?? []
      actions.setGeneratedCodes(codes)
      actions.setShowGenerated(true)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: codesQueryKey(state.codesPage, state.codesPageSize, state.filterStatus, currentSearch) }),
        queryClient.invalidateQueries({ queryKey: statsQueryKey }),
      ])
    },
    onError: (error) => {
      const message = getErrorMessage(error, MSG.errors.generateCodes)
      actions.setError(message)
    },
    onSettled: () => {
      actions.setGenerateLoading(false)
    },
  })

  const generateCodes = useCallback(
    async (count: number, prefix?: string) => {
      try {
        await generateCodesMutation.mutateAsync({ count, prefix })
        return { success: true }
      } catch (error) {
        const message = getErrorMessage(error, MSG.errors.generateCodes)
        return { success: false, error: message }
      }
    },
    [generateCodesMutation],
  )

  return {
    checkAuth,
    login,
    logout,
    loadMothers,
    loadUsers,
    loadCodes,
    loadAuditLogs,
    loadBulkHistory,
    loadStats,
    generateCodes,
  }
}
