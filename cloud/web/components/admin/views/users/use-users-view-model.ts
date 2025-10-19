'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAdminContext, useAdminActions, type UserData } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { fetchUsers } from '@/lib/api/users'
import { useAdminBatchActions } from '@/hooks/use-admin-batch-actions'
import { useAdminCsrfToken } from '@/hooks/use-admin-csrf-token'
import { useNotifications } from '@/components/notification-system'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'
import type { UserTableColumn } from '@/components/admin/sections/users-section'
import { STATUS_TEXT } from './constants'
import { buildUserTableColumns } from './components/users-table-columns'

type UserAction = 'resend' | 'cancel' | 'remove'

interface UsersViewModel {
  usersLoading: boolean
  filteredUsers: UserData[]
  userTableColumns: UserTableColumn[]
  containerHeight: number
  itemHeight: number
  selectedUsers: number[]
  batchOperation: string
  setBatchOperation: Dispatch<SetStateAction<string>>
  batchLoading: boolean
  clearSelection: () => void
  supportedBatchActions: string[]
  executeBatch: () => Promise<void>
  executeBatchAsync: () => Promise<void>
  refreshUsers: () => void
  handleUserRowAction: (user: UserData) => Promise<void>
  usersPage: number
  usersPageSize: number
  usersTotal: number
  handlePageChange: (page: number) => void
  handlePageSizeChange: (pageSize: number) => void
}

export const useUsersViewModel = (): UsersViewModel => {
  const { state } = useAdminContext()
  const { setUsersPage, setUsersPageSize } = useAdminActions()
  const { loadStats } = useAdminSimple()
  const queryClient = useQueryClient()
  const { actions: batchActions } = useAdminBatchActions()
  const { ensureCsrfToken, resetCsrfToken } = useAdminCsrfToken()
  const notifications = useNotifications()
  const debouncedSearchTerm = useDebouncedValue(state.searchTerm, 300)

  const [selectedUsers, setSelectedUsers] = useState<number[]>([])
  const [batchOperation, setBatchOperation] = useState('')
  const [batchLoading, setBatchLoading] = useState(false)
  const [userActionLoading, setUserActionLoading] = useState<number | null>(null)

  const containerHeight = 400
  const itemHeight = 60

  const isUserSelected = useCallback(
    (userId: number) => selectedUsers.includes(userId),
    [selectedUsers],
  )

  const updateUserSelection = useCallback((userId: number, next: boolean) => {
    setSelectedUsers((prev) => {
      if (next) {
        if (prev.includes(userId)) {
          return prev
        }
        return [...prev, userId]
      }
      return prev.filter((id) => id !== userId)
    })
  }, [])

  // toggleSelectAll defined after users is computed

  // Query users data directly (reduce duplicated global store writes)
  const usersQueryKey = useMemo(
    () => ['admin', 'users', state.usersPage, state.usersPageSize, state.filterStatus, debouncedSearchTerm] as const,
    [state.usersPage, state.usersPageSize, state.filterStatus, debouncedSearchTerm],
  )

  const usersQuery = useQuery({
    queryKey: usersQueryKey,
    enabled: state.authenticated === true,
    // v5: keepPreviousData removed
    queryFn: () =>
      fetchUsers({
        page: state.usersPage,
        page_size: state.usersPageSize,
        status: state.filterStatus,
        search: debouncedSearchTerm,
      }).then((res) => {
        if (!('ok' in res) || !res.ok) {
          throw new Error(res.error || '加载用户数据失败')
        }
        return res.data ?? { items: [], pagination: {} }
      }),
  })

  const users = useMemo(() => (Array.isArray(usersQuery.data?.items) ? usersQuery.data!.items : []), [usersQuery.data])
  const usersTotal = useMemo(() => usersQuery.data?.pagination?.total ?? users.length, [usersQuery.data, users.length])

  const allUsersSelected = users.length > 0 && users.every((user) => selectedUsers.includes(user.id))

  useEffect(() => {
    setSelectedUsers((prev) => prev.filter((id) => users.some((user) => user.id === id)))
  }, [users])

  const toggleSelectAll = useCallback(
    (next: boolean) => {
      if (next) {
        const allIds = users.map((user) => user.id)
        setSelectedUsers(allIds)
      } else {
        setSelectedUsers([])
      }
    },
    [users],
  )

  const refreshUsers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: usersQueryKey })
  }, [queryClient, usersQueryKey])

  // Auto refresh current query
  
  useAdminAutoRefresh(() => usersQuery.refetch(), state.authenticated === true)

  const handleUserAction = useCallback(
    async (user: UserData, action: UserAction) => {
      if (!user.team_id) {
        notifications.addNotification({
          type: 'error',
          title: '无法执行操作',
          message: '该用户缺少团队信息，无法执行。',
        })
        return
      }

      setUserActionLoading(user.id)
      try {
        const endpoint =
          action === 'resend'
            ? '/api/admin/resend'
            : action === 'cancel'
              ? '/api/admin/cancel-invite'
              : '/api/admin/remove-member'

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Source': 'nextjs-frontend',
          },
          body: JSON.stringify({
            email: user.email,
            team_id: user.team_id,
          }),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok || data?.success === false) {
          throw new Error(data?.message || data?.detail || '操作失败')
        }

        notifications.addNotification({
          type: 'success',
          title:
            action === 'resend'
              ? '邀请已重发'
              : action === 'cancel'
                ? '邀请已取消'
                : '成员已移除',
          message: data?.message || `${user.email} 的请求已处理`,
        })
        refreshUsers()
        loadStats()
      } catch (error) {
        const message = error instanceof Error ? error.message : '操作失败'
        notifications.addNotification({
          type: 'error',
          title:
            action === 'resend'
              ? '重发邀请失败'
              : action === 'cancel'
                ? '取消邀请失败'
                : '移除成员失败',
          message,
        })
      } finally {
        setUserActionLoading(null)
      }
    },
    [loadStats, notifications, refreshUsers],
  )

  const handleBatchExecute = useCallback(async () => {
    if (!batchOperation || selectedUsers.length === 0) {
      return
    }

    setBatchLoading(true)
    try {
      const token = await ensureCsrfToken()
      const response = await fetch('/api/admin/batch/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
          'X-Request-Source': 'nextjs-frontend',
        },
        body: JSON.stringify({
          action: batchOperation,
          ids: selectedUsers,
          confirm: true,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || data?.detail || '批量操作失败')
      }
      notifications.addNotification({
        type: 'success',
        title: '批量操作完成',
        message: data?.message || `操作已执行：成功 ${data?.processed_count ?? selectedUsers.length}`,
      })
      setSelectedUsers([])
      setBatchOperation('')
      refreshUsers()
      loadStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : '批量操作失败'
      notifications.addNotification({
        type: 'error',
        title: '批量操作失败',
        message,
      })
    } finally {
      setBatchLoading(false)
      resetCsrfToken()
    }
  }, [
    batchOperation,
    ensureCsrfToken,
    loadStats,
    notifications,
    refreshUsers,
    resetCsrfToken,
    selectedUsers,
  ])

  const handleBatchExecuteAsync = useCallback(async () => {
    if (!batchOperation || selectedUsers.length === 0) {
      return
    }
    setBatchLoading(true)
    try {
      const token = await ensureCsrfToken()
      const response = await fetch('/api/admin/batch/users/async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
          'X-Request-Source': 'nextjs-frontend',
        },
        body: JSON.stringify({
          action: batchOperation,
          ids: selectedUsers,
          confirm: true,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || data?.detail || '异步批量提交失败')
      }
      notifications.addNotification({
        type: 'success',
        title: '任务已提交',
        message: `任务 #${data?.job_id ?? ''} 已创建，系统将后台执行`,
      })
      setSelectedUsers([])
      setBatchOperation('')
    } catch (error) {
      const message = error instanceof Error ? error.message : '异步批量提交失败'
      notifications.addNotification({
        type: 'error',
        title: '任务提交失败',
        message,
      })
    } finally {
      setBatchLoading(false)
      resetCsrfToken()
    }
  }, [batchOperation, ensureCsrfToken, notifications, resetCsrfToken, selectedUsers])

  const handleUserRowAction = useCallback(
    async (user: UserData) => {
      const details = [
        `邮箱: ${user.email}`,
        `状态: ${STATUS_TEXT[user.status] ?? user.status}`,
        `团队: ${user.team_name || user.team_id || '未分配'}`,
        `邀请时间: ${user.invited_at ? new Date(user.invited_at).toLocaleString() : '-'}`,
        `兑换码: ${user.code_used || '无'}`,
      ].join('\n')
      try {
        await navigator.clipboard.writeText(details)
        notifications.addNotification({
          type: 'success',
          title: '用户信息已复制',
          message: `${user.email} 的信息已复制到剪贴板`,
        })
      } catch {
        notifications.addNotification({
          type: 'error',
          title: '复制失败',
          message: '无法访问剪贴板，请手动复制。',
        })
      }
    },
    [notifications],
  )

  const handlePageChange = useCallback(
    (page: number) => {
      const next = Math.max(1, page)
      setUsersPage(next)
      refreshUsers()
    },
    [refreshUsers, setUsersPage, state.usersPageSize],
  )

  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      const nextSize = Math.max(1, Math.min(pageSize, 200))
      setUsersPageSize(nextSize)
      setUsersPage(1)
      refreshUsers()
    },
    [refreshUsers, setUsersPage, setUsersPageSize],
  )

  const userTableColumns = useMemo<UserTableColumn[]>(
    () =>
      buildUserTableColumns({
        allUsersSelected,
        onToggleAll: toggleSelectAll,
        isUserSelected,
        onToggleUser: updateUserSelection,
        onUserAction: handleUserAction,
        userActionLoading,
      }),
    [allUsersSelected, handleUserAction, isUserSelected, toggleSelectAll, updateUserSelection, userActionLoading],
  )

  return {
    usersLoading: usersQuery.isFetching,
    filteredUsers: users,
    userTableColumns,
    containerHeight,
    itemHeight,
    selectedUsers,
    batchOperation,
    setBatchOperation,
    batchLoading,
    clearSelection: () => setSelectedUsers([]),
    supportedBatchActions: batchActions.users,
    executeBatch: handleBatchExecute,
    executeBatchAsync: handleBatchExecuteAsync,
    refreshUsers,
    handleUserRowAction,
    usersPage: state.usersPage,
    usersPageSize: state.usersPageSize,
    usersTotal,
    handlePageChange,
    handlePageSizeChange,
  }
}
