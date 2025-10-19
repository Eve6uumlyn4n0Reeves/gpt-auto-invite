'use client'

import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CodesStatusSection, type CodeStatusTableColumn } from '@/components/admin/sections/codes-status-section'
import { useAdminContext, useAdminActions, type CodeData } from '@/store/admin-context'
import { useNotifications } from '@/components/notification-system'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'
import { fetchCodes } from '@/lib/api/codes'

export function CodesStatusView() {
  const { state } = useAdminContext()
  const {
    setCodesStatusMother,
    setCodesStatusTeam,
    setCodesStatusBatch,
    setFilterStatus,
    setSearchTerm,
    setCodesPage,
    setCodesPageSize,
  } = useAdminActions()
  const queryClient = useQueryClient()
  const notifications = useNotifications()
  const debouncedSearchTerm = useDebouncedValue(state.searchTerm, 300)

  const containerHeight = 420
  const itemHeight = 60

  const codesQueryKey = useMemo(
    () => ['admin', 'codes', state.codesPage, state.codesPageSize, state.filterStatus, debouncedSearchTerm] as const,
    [state.codesPage, state.codesPageSize, state.filterStatus, debouncedSearchTerm],
  )

  const codesQuery = useQuery({
    queryKey: codesQueryKey,
    enabled: state.authenticated === true,
    // React Query v5 removed keepPreviousData; we rely on caching by key
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

  const baseCodes = useMemo(() => (Array.isArray(codesQuery.data?.items) ? codesQuery.data!.items : []), [codesQuery.data])
  const codesTotal = useMemo(() => codesQuery.data?.pagination?.total ?? baseCodes.length, [codesQuery.data, baseCodes.length])

  const uniqueMothers = useMemo(() => {
    const s = new Set<string>()
    baseCodes.forEach((c) => c.mother_name && s.add(c.mother_name))
    return Array.from(s)
  }, [baseCodes])

  const uniqueTeams = useMemo(() => {
    const s = new Set<string>()
    baseCodes.forEach((c) => (c.team_name || c.team_id) && s.add(c.team_name || (c.team_id as string)))
    return Array.from(s)
  }, [baseCodes])

  const uniqueBatches = useMemo(() => {
    const s = new Set<string>()
    baseCodes.forEach((c) => c.batch_id && s.add(c.batch_id))
    return Array.from(s)
  }, [baseCodes])

  const filteredCodesStatus = useMemo(() => {
    return baseCodes.filter((c) => {
      const motherOk = !state.codesStatusMother || c.mother_name === state.codesStatusMother
      const teamOk = !state.codesStatusTeam || c.team_name === state.codesStatusTeam || c.team_id === state.codesStatusTeam
      const batchOk = !state.codesStatusBatch || c.batch_id === state.codesStatusBatch
      return motherOk && teamOk && batchOk
    })
  }, [baseCodes, state.codesStatusMother, state.codesStatusTeam, state.codesStatusBatch])

  const refreshCodes = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: codesQueryKey })
  }, [queryClient, codesQueryKey])

  useAdminAutoRefresh(() => codesQuery.refetch(), state.authenticated === true)

  const handleCopyDetails = useCallback(
    async (code: CodeData) => {
      try {
        const details = [
          `兑换码: ${code.code}`,
          `批次: ${code.batch_id || '无'}`,
          `状态: ${code.is_used ? '已使用' : '未使用'}`,
          `邮箱: ${code.used_by || '-'}`,
          `母号: ${code.mother_name || '-'}`,
          `团队: ${code.team_name || code.team_id || '-'}`,
          `创建时间: ${code.created_at ? new Date(code.created_at).toLocaleString() : '-'}`,
          `使用时间: ${code.used_at ? new Date(code.used_at).toLocaleString() : '-'}`,
        ].join('\n')
        await navigator.clipboard.writeText(details)
        notifications.addNotification({
          type: 'success',
          title: '复制成功',
          message: '兑换码信息已复制到剪贴板',
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

  const codeTableColumns = useMemo<CodeStatusTableColumn[]>(
    () => [
      {
        key: 'code',
        label: '兑换码',
        render: (value: string) => <span className="font-mono text-sm font-medium">{value}</span>,
      },
      {
        key: 'is_used',
        label: '状态',
        render: (value: boolean) => (
          <span
            className={`rounded-full border px-2 py-1 text-xs font-medium ${
              value
                ? 'border-red-500/30 bg-red-500/20 text-red-600'
                : 'border-green-500/30 bg-green-500/20 text-green-600'
            }`}
          >
            {value ? '已使用' : '未使用'}
          </span>
        ),
      },
      {
        key: 'used_by',
        label: '邮箱',
        render: (value: string) => value || '-',
      },
      {
        key: 'mother_name',
        label: '母号',
        render: (value: string) => value || '-',
      },
      {
        key: 'team_name',
        label: '团队',
        render: (value: string, row: CodeData) => value || row.team_id || '-',
      },
      {
        key: 'batch_id',
        label: '批次',
        render: (value: string) => value || '-',
      },
      {
        key: 'created_at',
        label: '创建时间',
        render: (value: string) => (value ? new Date(value).toLocaleString() : '-'),
      },
      {
        key: 'used_at',
        label: '使用时间',
        render: (value: string) => (value ? new Date(value).toLocaleString() : '-'),
      },
    ],
    [],
  )

  return (
    <CodesStatusSection
      loading={codesQuery.isFetching}
      filterStatus={state.filterStatus}
      onFilterStatusChange={setFilterStatus}
      codesStatusMother={state.codesStatusMother}
      onCodesStatusMotherChange={setCodesStatusMother}
      codesStatusTeam={state.codesStatusTeam}
      onCodesStatusTeamChange={setCodesStatusTeam}
      codesStatusBatch={state.codesStatusBatch}
      onCodesStatusBatchChange={setCodesStatusBatch}
      searchTerm={state.searchTerm}
      onSearchTermChange={setSearchTerm}
      uniqueMothers={uniqueMothers}
      uniqueTeams={uniqueTeams}
      uniqueBatches={uniqueBatches}
      data={filteredCodesStatus}
      codeTableColumns={codeTableColumns}
      containerHeight={containerHeight}
      itemHeight={itemHeight}
      onRowAction={handleCopyDetails}
      page={state.codesPage}
      pageSize={state.codesPageSize}
      total={codesTotal}
      onRefresh={refreshCodes}
      onPageChange={(page) => {
        const next = Math.max(1, page)
        setCodesPage(next)
        refreshCodes()
      }}
      onPageSizeChange={(pageSize) => {
        const nextSize = Math.max(1, Math.min(pageSize, 200))
        setCodesPageSize(nextSize)
        setCodesPage(1)
        refreshCodes()
      }}
    />
  )
}
