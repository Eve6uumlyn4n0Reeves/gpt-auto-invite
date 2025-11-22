'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminContext, useAdminActions, type CodeData } from '@/store/admin-context'
import { CodeStatus } from '@/shared/api-types'
import { useUsersContext, useUsersActions } from '@/domains/users/store'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { fetchCodes } from '@/lib/api/codes'
import { useAdminBatchActions } from '@/hooks/use-admin-batch-actions-compat'
import { batchCodes, disableCode } from '@/lib/api/codes-actions'
import {
  generateCodes,
  fetchCodeSkus,
  createCodeSku,
  updateCodeSku,
  type CodeSkuPayload,
} from '@/lib/api/codes'
import type { CodeSkuSummary } from '@/shared/api-types'
import { useAdminQuota } from '@/hooks/use-admin-quota'
import { useNotifications } from '@/components/notification-system'
import { useSuccessFlow } from '@/hooks/use-success-flow'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'
import { usePaginatedQuery } from '@/hooks/use-paginated-query'
import type { CodeTableColumn } from '@/components/admin/sections/codes-section'
import { buildCodesTableColumns } from '@/components/admin/views/codes/components/codes-table-columns'
import type { FilterStatus } from '@/store/users/types'

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
  setCodeLifecyclePlan: (plan: 'weekly' | 'monthly') => void
  setCodeSwitchLimit: (value: number) => void
  codeCount: number
  codePrefix: string
  codeLifecyclePlan: 'weekly' | 'monthly'
  codeSwitchLimit: number
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
  codeSkus: CodeSkuSummary[]
  selectedSkuSlug: string
  skuLoading: boolean
  onSkuChange: (slug: string) => void
  refreshSkus: () => Promise<void>
  createSku: (payload: CodeSkuPayload) => Promise<void>
  updateSku: (id: number, payload: Partial<CodeSkuPayload>) => Promise<void>
  capacityWarn: boolean
  aliveMothers: number | null
}

export const useCodesViewModel = (): CodesViewModel => {
  const { state: adminState } = useAdminContext()
  const { state: usersState } = useUsersContext()
  const usersActions = useUsersActions()
  const {
    setCodeCount,
    setCodePrefix,
    setCodeLifecyclePlan,
    setCodeSwitchLimit,
    setGeneratedCodes,
    setShowGenerated,
    setGenerateLoading,
    setCodeSkuSlug,
    setCodeSkus,
  } = useAdminActions()
  const { loadStats } = useAdminSimple()
  const queryClient = useQueryClient()
  const { actions: batchActions } = useAdminBatchActions()
  const quota = useAdminQuota()
  const notifications = useNotifications()
  const { succeed } = useSuccessFlow()
  const debouncedSearchTerm = useDebouncedValue(usersState.searchTerm, 300)

  const [selectedCodes, setSelectedCodes] = useState<number[]>([])
  const [batchOperation, setBatchOperation] = useState('')
  const [batchLoading, setBatchLoading] = useState(false)
  const [skuLoading, setSkuLoading] = useState(false)

  const containerHeight = 400
  const itemHeight = 60

  useEffect(() => {
    void quota.refresh()
  }, [quota.refresh])

  const loadSkus = useCallback(async () => {
    setSkuLoading(true)
    try {
      const res = await fetchCodeSkus(true)
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '加载兑换码商品失败')
      }
      const list = Array.isArray(res.data) ? (res.data as CodeSkuSummary[]) : []
      setCodeSkus(list)
      if (!adminState.codeSkuSlug) {
        const firstActive = list.find((sku) => sku.is_active)
        if (firstActive) {
          setCodeSkuSlug(firstActive.slug)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载兑换码商品失败'
      notifications.addNotification({
        type: 'error',
        title: '加载失败',
        message,
      })
    } finally {
      setSkuLoading(false)
    }
  }, [adminState.codeSkuSlug, notifications, setCodeSkus, setCodeSkuSlug])

  useEffect(() => {
    void loadSkus()
  }, [loadSkus])

  // Query codes directly via React Query
  const normalizeCodeStatus = useCallback(
    (status: FilterStatus): CodeStatus | 'all' | undefined => {
      if (status === 'all') return 'all'
      const validStatuses = new Set<CodeStatus>(Object.values(CodeStatus))
      return validStatuses.has(status as CodeStatus) ? (status as CodeStatus) : undefined
    },
    [],
  )

  const currentCodeStatus = useMemo(
    () => normalizeCodeStatus(usersState.filterStatus),
    [normalizeCodeStatus, usersState.filterStatus],
  )

  const codesQueryKey = useMemo(
    () =>
      ['admin', 'codes', usersState.codesPage, usersState.codesPageSize, currentCodeStatus ?? 'all', debouncedSearchTerm] as const,
    [usersState.codesPage, usersState.codesPageSize, currentCodeStatus, debouncedSearchTerm],
  )

  const { query: codesQuery, items: codes, total: codesTotal } = usePaginatedQuery({
    key: codesQueryKey,
    page: usersState.codesPage,
    pageSize: usersState.codesPageSize,
    fetchPage: async (page, pageSize) => {
      const res = await fetchCodes({
        page,
        page_size: pageSize,
        status: currentCodeStatus,
        search: debouncedSearchTerm,
      })
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '加载兑换码数据失败')
      }
      return res.data ?? { items: [], pagination: {} }
    },
  })

  useEffect(() => {
    setSelectedCodes((prev) => prev.filter((id) => codes.some((code) => code.id === id)))
  }, [codes])

  const refreshCodes = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: codesQueryKey })
  }, [queryClient, codesQueryKey])

  useAdminAutoRefresh(() => codesQuery.refetch(), adminState.authenticated === true)

  const handleCopyDetails = useCallback(
    async (code: CodeData) => {
      const details = [
        `兑换码: ${code.code}`,
        `状态: ${code.status ? code.status : (code.is_used ? 'used' : 'unused')}`,
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
      const res = await batchCodes({ action: batchOperation, ids: selectedCodes })
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '批量操作失败')
      }

      notifications.addNotification({
        type: 'success',
        title: '批量操作完成',
        message: res.data?.message || `兑换码批量操作已执行（共 ${selectedCodes.length} 个）`,
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
    }
  }, [batchOperation, notifications, quota, refreshCodes, selectedCodes])

  const handleDisableCode = useCallback(
    async (code: CodeData) => {
      try {
        const response = await disableCode(code.id)
        if (!('ok' in response) || !response.ok) {
          throw new Error(response.error || '禁用失败')
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
      }
    },
    [notifications, refreshCodes],
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
    if (adminState.stats?.remaining_code_quota !== undefined) {
      return adminState.stats.remaining_code_quota
    }
    if (
      adminState.stats?.max_code_capacity !== undefined &&
      adminState.stats?.active_codes !== undefined
    ) {
      return Math.max(adminState.stats.max_code_capacity - adminState.stats.active_codes, 0)
    }
    return null
  }, [
    adminState.stats?.active_codes,
    adminState.stats?.max_code_capacity,
    adminState.stats?.remaining_code_quota,
    quota.quota?.remaining_quota,
  ])

  const maxCodeCapacity =
    quota.quota?.max_code_capacity ?? adminState.stats?.max_code_capacity ?? null
  const activeCodesCount =
    quota.quota?.active_codes ?? adminState.stats?.active_codes ?? null
  const capacityWarn = quota.quota?.capacity_warn ?? false
  const aliveMothers = quota.quota?.alive_mothers ?? null

  const generatedCodesPreview = useMemo(
    () => (adminState.showGenerated ? adminState.generatedCodes : []),
    [adminState.generatedCodes, adminState.showGenerated],
  )

  const handleGenerateCodes = useCallback(async () => {
    if (adminState.codeCount < 1) {
      notifications.addNotification({
        type: 'error',
        title: '生成失败',
        message: '请输入正确的数量',
      })
      return
    }

    if (adminState.codeCount > 1000) {
      notifications.addNotification({
        type: 'error',
        title: '生成失败',
        message: '单次最多生成 1000 个兑换码',
      })
      return
    }

    const remaining =
      remainingQuota ??
      (adminState.stats?.max_code_capacity && adminState.stats?.active_codes !== undefined
        ? Math.max(adminState.stats.max_code_capacity - (adminState.stats.active_codes ?? 0), 0)
        : null)

    if (remaining !== null && adminState.codeCount > remaining) {
      notifications.addNotification({
        type: 'error',
        title: '超出配额',
        message: `当前剩余配额为 ${remaining}，请调整生成数量。`,
      })
      return
    }

    if (adminState.codeSwitchLimit < 1) {
      notifications.addNotification({
        type: 'error',
        title: '配置无效',
        message: '切换次数上限需大于等于 1',
      })
      return
    }

    if (!adminState.codeSkuSlug) {
      notifications.addNotification({
        type: 'error',
        title: '未选择商品',
        message: '请选择要生成的兑换码商品类型。',
      })
      return
    }

    setGenerateLoading(true)
    await succeed(
      async () => {
        const response = await generateCodes({
          count: adminState.codeCount,
          prefix: adminState.codePrefix || undefined,
          lifecycle_plan: adminState.codeLifecyclePlan,
          switch_limit: adminState.codeSwitchLimit,
        })
        if (!('ok' in response) || !response.ok) throw new Error(response.error || '生成兑换码失败')
        return response.data
      },
      (data: any) => {
        const codes = Array.isArray(data?.codes) ? data.codes : []
        setGeneratedCodes(codes)
        setShowGenerated(true)
        refreshCodes()
        loadStats()
        void quota.refresh()
        return { title: '兑换码已生成', message: `成功生成 ${codes.length} 个兑换码` }
      },
    )
    setGenerateLoading(false)
  }, [
    loadStats,
    notifications,
    quota,
    refreshCodes,
    remainingQuota,
    setGenerateLoading,
    setGeneratedCodes,
    setShowGenerated,
    adminState.codeCount,
    adminState.codePrefix,
    adminState.stats?.active_codes,
    adminState.stats?.max_code_capacity,
    adminState.codeSkuSlug,
  ])

  const handleCreateSku = useCallback(
    async (payload: CodeSkuPayload) => {
      const res = await createCodeSku(payload)
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '创建兑换码商品失败')
      }
      notifications.addNotification({
        type: 'success',
        title: '已创建兑换码商品',
        message: `${res.data?.name ?? '新商品'} 已启用`,
      })
      await loadSkus()
    },
    [loadSkus, notifications],
  )

  const handleUpdateSku = useCallback(
    async (id: number, payload: Partial<CodeSkuPayload>) => {
      const res = await updateCodeSku(id, payload)
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '更新兑换码商品失败')
      }
      notifications.addNotification({
        type: 'success',
        title: '兑换码商品已更新',
        message: `${res.data?.name ?? '商品'} 的配置已保存`,
      })
      await loadSkus()
    },
    [loadSkus, notifications],
  )

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
      usersActions.setCodesPage(next)
      refreshCodes()
    },
    [refreshCodes, usersActions],
  )

  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      const nextSize = Math.max(1, Math.min(pageSize, 200))
      usersActions.setCodesPageSize(nextSize)
      usersActions.setCodesPage(1)
      refreshCodes()
    },
    [refreshCodes, usersActions],
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
    setCodeLifecyclePlan,
    setCodeSwitchLimit: (value: number) => setCodeSwitchLimit(Math.max(1, Math.min(value, 100))),
    codeCount: adminState.codeCount,
    codePrefix: adminState.codePrefix,
    codeLifecyclePlan: adminState.codeLifecyclePlan,
    codeSwitchLimit: adminState.codeSwitchLimit,
    remainingQuota,
    maxCodeCapacity,
    activeCodesCount,
    quotaLoading: quota.loading,
    quotaError: quota.error,
    generatedCodesPreview,
    showGenerated: adminState.showGenerated,
    copyGeneratedCodes,
    downloadGeneratedCodes,
    codesPage: usersState.codesPage,
    codesPageSize: usersState.codesPageSize,
    codesTotal,
    handlePageChange,
    handlePageSizeChange,
    allCodesSelected,
    toggleSelectAllCodes,
    updateCodeSelection,
    generateLoading: adminState.generateLoading,
    codeSkus: adminState.codeSkus,
    selectedSkuSlug: adminState.codeSkuSlug,
    skuLoading,
    onSkuChange: setCodeSkuSlug,
    refreshSkus: loadSkus,
    createSku: handleCreateSku,
    updateSku: handleUpdateSku,
    capacityWarn,
    aliveMothers,
  }
}
