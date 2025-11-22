'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminContext, type UserData } from '@/store/admin-context'
import { useUsersContext, useUsersActions } from '@/domains/users/store'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { fetchUsers } from '@/lib/api/users'
import { useAdminBatchActions } from '@/hooks/use-admin-batch-actions-compat'
import { resendInvite, cancelInvite, removeMember, batchUsers, batchUsersAsync, switchSeat } from '@/lib/api/user-actions'
import { useNotifications } from '@/components/notification-system'
import { useSuccessFlow } from '@/hooks/use-success-flow'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'
import { usePaginatedQuery } from '@/hooks/use-paginated-query'
import type { UserTableColumn } from '@/components/admin/sections/users-section'
import { STATUS_TEXT } from '@/components/admin/views/users/constants'
import { InviteStatus } from '@/shared/api-types'
import type { FilterStatus } from '@/store/users/types'
import { buildUserTableColumns } from '@/components/admin/views/users/components/users-table-columns'

type UserAction = 'resend' | 'cancel' | 'remove' | 'switch'

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
  const { state: adminState } = useAdminContext()
  const { state: usersState } = useUsersContext()
  const { setUsersPage, setUsersPageSize } = useUsersActions()
  const { loadStats } = useAdminSimple()
  const queryClient = useQueryClient()
  const { actions: batchActions } = useAdminBatchActions()
  // CSRF 由 usersAdminRequest 内部处理，无需在 VM 手动获取
  const notifications = useNotifications()
  const { succeed } = useSuccessFlow()
  const debouncedSearchTerm = useDebouncedValue(usersState.searchTerm, 300)

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

  const normalizeUserStatus = useCallback(
    (status: FilterStatus): InviteStatus | 'all' | undefined => {
      if (status === 'all') return 'all'
      const validStatuses = new Set<InviteStatus>(Object.values(InviteStatus))
      return validStatuses.has(status as InviteStatus) ? (status as InviteStatus) : undefined
    },
    [],
  )

  const currentUserStatus = useMemo(
    () => normalizeUserStatus(usersState.filterStatus),
    [normalizeUserStatus, usersState.filterStatus],
  )

  // Query users data directly (reduce duplicated global store writes)
  const usersQueryKey = useMemo(
    () => ['admin', 'users', usersState.usersPage, usersState.usersPageSize, currentUserStatus ?? 'all', debouncedSearchTerm] as const,
    [usersState.usersPage, usersState.usersPageSize, currentUserStatus, debouncedSearchTerm],
  )

  const { query: usersQuery, items: users, total: usersTotal } = usePaginatedQuery({
    key: usersQueryKey,
    page: usersState.usersPage,
    pageSize: usersState.usersPageSize,
    fetchPage: async (page, pageSize) => {
      const res = await fetchUsers({
        page,
        page_size: pageSize,
        status: currentUserStatus,
        search: debouncedSearchTerm,
      })
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '加载用户数据失败')
      }
      return res.data ?? { items: [], pagination: {} }
    },
  })

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
  
  useAdminAutoRefresh(() => usersQuery.refetch(), adminState.authenticated === true)

  const handleUserAction = useCallback(
    async (user: UserData, action: UserAction) => {
      if (action !== 'switch' && !user.team_id) {
        notifications.addNotification({
          type: 'error',
          title: '无法执行操作',
          message: '该用户缺少团队信息，无法执行。',
        })
        return
      }

      setUserActionLoading(user.id)
      try {
        const apiRes =
          action === 'resend'
            ? await resendInvite({ email: user.email, team_id: user.team_id! })
            : action === 'cancel'
              ? await cancelInvite({ email: user.email, team_id: user.team_id! })
              : action === 'remove'
                ? await removeMember({ email: user.email, team_id: user.team_id! })
                : await switchSeat({ email: user.email, code: user.code_used || undefined })

        if (!('ok' in apiRes) || !apiRes.ok) {
          throw new Error(apiRes.error || '操作失败')
        }

        const okMessage =
          action === 'resend'
            ? '邀请已重发'
            : action === 'cancel'
              ? '邀请已取消'
              : action === 'remove'
                ? '成员已移除'
                : apiRes.data?.queued
                  ? '已加入切换队列'
                  : '切换完成'
        const detailMessage =
          action === 'switch'
            ? apiRes.data?.queued
              ? `已加入排队（#${apiRes.data?.request_id ?? '等待中'}）`
              : apiRes.data?.message || '用户已切换至新的团队'
            : apiRes.data?.message || `${user.email} 的请求已处理`
        notifications.addNotification({
          type: 'success',
          title: okMessage,
          message: detailMessage,
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
      const response = await batchUsers({ action: batchOperation, ids: selectedUsers })
      if (!('ok' in response) || !response.ok) {
        throw new Error(response.error || '批量操作失败')
      }
      notifications.addNotification({
        type: 'success',
        title: '批量操作完成',
        message: response.data?.message || `操作已执行：成功 ${response.data?.processed_count ?? selectedUsers.length}`,
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
    }
  }, [batchOperation, loadStats, notifications, refreshUsers, selectedUsers])

  const handleBatchExecuteAsync = useCallback(async () => {
    if (!batchOperation || selectedUsers.length === 0) {
      return
    }
    setBatchLoading(true)
    try {
      const result = await succeed(
        async () => {
          const response = await batchUsersAsync({ action: batchOperation, ids: selectedUsers })
          if (!('ok' in response) || !response.ok) {
            throw new Error(response.error || '异步批量提交失败')
          }
          return response.data
        },
        (data) => ({
          title: '任务已提交',
          message: `任务 #${data?.job_id ?? ''} 已创建`,
          navigateTo: '/admin/(protected)/jobs',
        }),
      )
      if (result.ok) {
        setSelectedUsers([])
        setBatchOperation('')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '异步批量提交失败'
      notifications.addNotification({ type: 'error', title: '任务提交失败', message })
    } finally {
      setBatchLoading(false)
    }
  }, [batchOperation, notifications, selectedUsers, succeed])

  const handleUserRowAction = useCallback(
    async (user: UserData) => {
      const details = [
        `邮箱: ${user.email}`,
        `状态: ${STATUS_TEXT[user.status as InviteStatus] ?? user.status}`,
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
    [refreshUsers, setUsersPage],
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
    usersPage: usersState.usersPage,
    usersPageSize: usersState.usersPageSize,
    usersTotal,
    handlePageChange,
    handlePageSizeChange,
  }
}
