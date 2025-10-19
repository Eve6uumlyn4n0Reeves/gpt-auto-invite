'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAdminContext, useAdminActions, type CodeData } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { fetchCodes } from '@/lib/api/codes'
import { useAdminBatchActions } from '@/hooks/use-admin-batch-actions'
import { useAdminCsrfToken } from '@/hooks/use-admin-csrf-token'
import { useAdminQuota } from '@/hooks/use-admin-quota'
import { useNotifications } from '@/components/notification-system'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'
import type { CodeTableColumn } from '@/components/admin/sections/codes-section'
import { buildCodesTableColumns } from './components/codes-table-columns'

interface CodesViewModel {
  codesLoading: boolean
  filteredCodes: CodeData[]
  codeTableColumns: CodeTableColumn[]
  containerHeight: number
  itemHeight: number
  selectedCodes: number[]
  batchOperation: string
  setBatchOperation: Dispatch<SetStateAction<string>>
  batchLoading: boolean
  clearSelection: () => void
  supportedBatchActions: string[]
  executeBatch: () => Promise<void>
  refreshCodes: () => void
  refreshQuota: () => Promise<void>
  handleGenerateCodes: () => Promise<void>
  handleCopyDetails: (code: CodeData) => Promise<void>
  setCodeCount: (value: number) => void
  setCodePrefix: (value: string) => void
  codeCount: number
  codePrefix: string
  remainingQuota: number | null
  maxCodeCapacity: number | null
  activeCodesCount: number | null
  quotaLoading: boolean
  quotaError: string | null
  generatedCodesPreview: string[]
  showGenerated: boolean
  copyGeneratedCodes: () => Promise<void>
  downloadGeneratedCodes: () => void
  codesPage: number
  codesPageSize: number
  codesTotal: number
  handlePageChange: (page: number) => void
  handlePageSizeChange: (pageSize: number) => void
  allCodesSelected: boolean
  toggleSelectAllCodes: (next: boolean) => void
  updateCodeSelection: (codeId: number, next: boolean) => void
  generateLoading: boolean
}

export const useCodesViewModel = (): CodesViewModel => {
  const { state } = useAdminContext()
  const {
    setCodesPage,
    setCodesPageSize,
    setCodeCount,
    setCodePrefix,
    setGeneratedCodes,
    setShowGenerated,
    setGenerateLoading,
  } = useAdminActions()
  const { loadStats } = useAdminSimple()
  const queryClient = useQueryClient()
  const { actions: batchActions } = useAdminBatchActions()
  const { ensureCsrfToken, resetCsrfToken } = useAdminCsrfToken()
  const quota = useAdminQuota()
  const notifications = useNotifications()
  const debouncedSearchTerm = useDebouncedValue(state.searchTerm, 300)

  const [selectedCodes, setSelectedCodes] = useState<number[]>([])
  const [batchOperation, setBatchOperation] = useState('')
  const [batchLoading, setBatchLoading] = useState(false)

  const containerHeight = 400
  const itemHeight = 60

  useEffect(() => {
    void quota.refresh()
  }, [quota.refresh])

  // Query codes directly via React Query
  const codesQueryKey = useMemo(
    () => ['admin', 'codes', state.codesPage, state.codesPageSize, state.filterStatus, debouncedSearchTerm] as const,
    [state.codesPage, state.codesPageSize, state.filterStatus, debouncedSearchTerm],
  )

  const codesQuery = useQuery({
    queryKey: codesQueryKey,
    enabled: state.authenticated === true,
    // v5: keepPreviousData removed
    queryFn: () =>
      fetchCodes({
        page: state.codesPage,
        page_size: state.codesPageSize,
        status: state.filterStatus,
        search: debouncedSearchTerm,
      }).then((res) => {
        if (!('ok' in res) || !res.ok) {
          throw new Error(res.error || '加载兑换码数据失败')
        }
        return res.data ?? { items: [], pagination: {} }
      }),
  })

  const codes = useMemo(() => (Array.isArray(codesQuery.data?.items) ? codesQuery.data!.items : []), [codesQuery.data])
  const codesTotal = useMemo(() => codesQuery.data?.pagination?.total ?? codes.length, [codesQuery.data, codes.length])

  useEffect(() => {
    setSelectedCodes((prev) => prev.filter((id) => codes.some((code) => code.id === id)))
  }, [codes])

  const refreshCodes = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: codesQueryKey })
  }, [queryClient, codesQueryKey])

  useAdminAutoRefresh(() => codesQuery.refetch(), state.authenticated === true)

  const handleCopyDetails = useCallback(
    async (code: CodeData) => {
      const details = [
        `兑换码: ${code.code}`,
        `状态: ${code.is_used ? '已使用' : '未使用'}`,
        `邮箱: ${code.used_by || '-'}`,
        `母号: ${code.mother_name || '-'}`,
        `团队: ${code.team_name || code.team_id || '-'}`,
        `批次: ${code.batch_id || '-'}`,
        `创建时间: ${code.created_at ? new Date(code.created_at).toLocaleString() : '-'}`,
        `使用时间: ${code.used_at ? new Date(code.used_at).toLocaleString() : '-'}`,
      ].join('\n')
      try {
        await navigator.clipboard.writeText(details)
        notifications.addNotification({
          type: 'success',
          title: '兑换码信息已复制',
          message: `${code.code} 的信息已复制到剪贴板`,
        })
      } catch (error) {
        notifications.addNotification({
          type: 'error',
          title: '复制失败',
          message: '无法访问剪贴板，请手动复制。',
        })
      }
    },
    [notifications],
  )

  const handleCopyCode = useCallback(
    async (code: CodeData) => {
      try {
        await navigator.clipboard.writeText(code.code)
        notifications.addNotification({
          type: 'success',
          title: '已复制兑换码',
          message: `${code.code} 已复制到剪贴板`,
          duration: 2000,
        })
      } catch {
        notifications.addNotification({
          type: 'error',
          title: '复制失败',
          message: '无法访问剪贴板，请手动复制',
        })
      }
    },
    [notifications],
  )

  const handleBatchExecute = useCallback(async () => {
    if (!batchOperation || selectedCodes.length === 0) {
      return
    }

    setBatchLoading(true)
    try {
      const token = await ensureCsrfToken()
      const response = await fetch('/api/admin/batch/codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
          'X-Request-Source': 'nextjs-frontend',
        },
        body: JSON.stringify({
          action: batchOperation,
          ids: selectedCodes,
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
        message: data?.message || '兑换码批量操作已执行',
      })
      setSelectedCodes([])
      setBatchOperation('')
      refreshCodes()
      void quota.refresh()
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
    notifications,
    quota,
    refreshCodes,
    resetCsrfToken,
    selectedCodes,
  ])

  const handleDisableCode = useCallback(
    async (code: CodeData) => {
      try {
        const token = await ensureCsrfToken()
        const response = await fetch(`/api/admin/codes/${code.id}/disable`, {
          method: 'POST',
          headers: {
            'X-CSRF-Token': token,
            'X-Request-Source': 'nextjs-frontend',
          },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data?.success === false) {
          throw new Error(data?.message || data?.detail || '禁用失败')
        }
        notifications.addNotification({
          type: 'success',
          title: '兑换码已禁用',
          message: `兑换码 ${code.code} 已禁用`,
        })
        refreshCodes()
      } catch (error) {
        const message = error instanceof Error ? error.message : '禁用兑换码失败'
        notifications.addNotification({
          type: 'error',
          title: '禁用失败',
          message,
        })
      } finally {
        resetCsrfToken()
      }
    },
    [ensureCsrfToken, notifications, refreshCodes, resetCsrfToken],
  )

  const isCodeSelected = useCallback(
    (codeId: number) => selectedCodes.includes(codeId),
    [selectedCodes],
  )

  const updateCodeSelection = useCallback((codeId: number, next: boolean) => {
    setSelectedCodes((prev) => {
      if (next) {
        if (prev.includes(codeId)) {
          return prev
        }
        return [...prev, codeId]
      }
      return prev.filter((id) => id !== codeId)
    })
  }, [])

  const toggleSelectAllCodes = useCallback(
    (next: boolean) => {
      if (next) {
        const allIds = codes.map((code) => code.id)
        setSelectedCodes(allIds)
      } else {
        setSelectedCodes([])
      }
    },
    [codes],
  )

  const allCodesSelected = codes.length > 0 && codes.every((code) => selectedCodes.includes(code.id))

  const remainingQuota = useMemo(() => {
    if (quota.quota?.remaining_quota !== undefined) {
      return quota.quota.remaining_quota
    }
    if (state.stats?.remaining_code_quota !== undefined) {
      return state.stats.remaining_code_quota
    }
    if (
      state.stats?.max_code_capacity !== undefined &&
      state.stats?.active_codes !== undefined
    ) {
      return Math.max(state.stats.max_code_capacity - state.stats.active_codes, 0)
    }
    return null
  }, [
    quota.quota?.remaining_quota,
    state.stats?.active_codes,
    state.stats?.max_code_capacity,
    state.stats?.remaining_code_quota,
  ])

  const maxCodeCapacity =
    quota.quota?.max_code_capacity ?? state.stats?.max_code_capacity ?? null
  const activeCodesCount =
    quota.quota?.active_codes ?? state.stats?.active_codes ?? null

  const generatedCodesPreview = useMemo(
    () => (state.showGenerated ? state.generatedCodes : []),
    [state.generatedCodes, state.showGenerated],
  )

  const handleGenerateCodes = useCallback(async () => {
    if (state.codeCount < 1) {
      notifications.addNotification({
        type: 'error',
        title: '生成失败',
        message: '请输入正确的数量',
      })
      return
    }

    if (state.codeCount > 1000) {
      notifications.addNotification({
        type: 'error',
        title: '生成失败',
        message: '单次最多生成 1000 个兑换码',
      })
      return
    }

    const remaining =
      remainingQuota ??
      (state.stats?.max_code_capacity && state.stats?.active_codes !== undefined
        ? Math.max(state.stats.max_code_capacity - (state.stats.active_codes ?? 0), 0)
        : null)

    if (remaining !== null && state.codeCount > remaining) {
      notifications.addNotification({
        type: 'error',
        title: '超出配额',
        message: `当前剩余配额为 ${remaining}，请调整生成数量。`,
      })
      return
    }

    setGenerateLoading(true)
    try {
      const token = await ensureCsrfToken()
      const response = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
          'X-Request-Source': 'nextjs-frontend',
        },
        body: JSON.stringify({
          count: state.codeCount,
          prefix: state.codePrefix || undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.detail || '生成兑换码失败')
      }

      const codes = Array.isArray(data?.codes) ? data.codes : []
      setGeneratedCodes(codes)
      setShowGenerated(true)
      notifications.addNotification({
        type: 'success',
        title: '兑换码已生成',
        message: `成功生成 ${codes.length} 个兑换码`,
      })
      refreshCodes()
      loadStats()
      void quota.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成兑换码失败'
      notifications.addNotification({
        type: 'error',
        title: '生成失败',
        message,
      })
    } finally {
      setGenerateLoading(false)
      resetCsrfToken()
    }
  }, [
    ensureCsrfToken,
    loadStats,
    notifications,
    quota,
    refreshCodes,
    remainingQuota,
    resetCsrfToken,
    setGenerateLoading,
    setGeneratedCodes,
    setShowGenerated,
    state.codeCount,
    state.codePrefix,
    state.stats?.active_codes,
    state.stats?.max_code_capacity,
  ])

  const copyGeneratedCodes = useCallback(async () => {
    if (generatedCodesPreview.length === 0) return

    try {
      await navigator.clipboard.writeText(generatedCodesPreview.join('\n'))
      notifications.addNotification({
        type: 'success',
        title: '复制成功',
        message: '兑换码列表已复制到剪贴板',
      })
    } catch {
      notifications.addNotification({
        type: 'error',
        title: '复制失败',
        message: '无法访问剪贴板，请手动复制',
      })
    }
  }, [generatedCodesPreview, notifications])

  const downloadGeneratedCodes = useCallback(() => {
    if (generatedCodesPreview.length === 0) return

    const content = generatedCodesPreview.join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `codes-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [generatedCodesPreview])

  const handlePageChange = useCallback(
    (page: number) => {
      const next = Math.max(1, page)
      setCodesPage(next)
      refreshCodes()
    },
    [refreshCodes, setCodesPage, state.codesPageSize],
  )

  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      const nextSize = Math.max(1, Math.min(pageSize, 200))
      setCodesPageSize(nextSize)
      setCodesPage(1)
      refreshCodes()
    },
    [refreshCodes, setCodesPage, setCodesPageSize],
  )

  const codeTableColumns = useMemo<CodeTableColumn[]>(
    () =>
      buildCodesTableColumns({
        allCodesSelected,
        onToggleAllCodes: toggleSelectAllCodes,
        isCodeSelected,
        onToggleCode: updateCodeSelection,
        onCopyCode: handleCopyCode,
        onDisableCode: handleDisableCode,
      }),
    [allCodesSelected, handleCopyCode, handleDisableCode, isCodeSelected, toggleSelectAllCodes, updateCodeSelection],
  )

  return {
    codesLoading: codesQuery.isFetching,
    filteredCodes: codes,
    codeTableColumns,
    containerHeight,
    itemHeight,
    selectedCodes,
    batchOperation,
    setBatchOperation,
    batchLoading,
    clearSelection: () => setSelectedCodes([]),
    supportedBatchActions: batchActions.codes,
    executeBatch: handleBatchExecute,
    refreshCodes,
    refreshQuota: quota.refresh,
    handleGenerateCodes,
    handleCopyDetails,
    setCodeCount,
    setCodePrefix,
    codeCount: state.codeCount,
    codePrefix: state.codePrefix,
    remainingQuota,
    maxCodeCapacity,
    activeCodesCount,
    quotaLoading: quota.loading,
    quotaError: quota.error,
    generatedCodesPreview,
    showGenerated: state.showGenerated,
    copyGeneratedCodes,
    downloadGeneratedCodes,
    codesPage: state.codesPage,
    codesPageSize: state.codesPageSize,
    codesTotal,
    handlePageChange,
    handlePageSizeChange,
    allCodesSelected,
    toggleSelectAllCodes,
    updateCodeSelection,
    generateLoading: state.generateLoading,
  }
}
