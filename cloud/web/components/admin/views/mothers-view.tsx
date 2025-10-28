'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MothersSection } from '@/components/admin/sections/mothers-section'
import { MotherFormDialog, getEmptyMotherFormState, type MotherFormState } from '@/components/admin/forms/mother-form-dialog'
import { PaginationControls } from '@/components/admin/pagination-controls'
import type { PoolMotherAccount } from '@/store/pool/types'
import { usePoolContext } from '@/store/pool/context'
import { usePoolMothers } from '@/hooks/use-pool-mothers'
import { useAdminCsrfToken } from '@/hooks/use-admin-csrf-token'
import { useNotifications } from '@/components/notification-system'
import { useAdminAutoRefresh } from '@/hooks/use-admin-auto-refresh'

export function MothersView() {
  const { state } = usePoolContext()
  const { loadMothers } = usePoolMothers()
  const { ensureCsrfToken, resetCsrfToken } = useAdminCsrfToken()
  const notifications = useNotifications()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [motherForm, setMotherForm] = useState<MotherFormState>(getEmptyMotherFormState)
  const [editingMother, setEditingMother] = useState<PoolMotherAccount | null>(null)

  const buildMotherPayload = useCallback((form: MotherFormState) => {
    const baseTeams = form.teams
      .filter((team) => team.team_id.trim().length > 0)
      .map((team) => ({
        team_id: team.team_id.trim(),
        team_name: team.team_name?.trim() || undefined,
        is_enabled: team.is_enabled,
        is_default: team.is_default,
      }))

    if (baseTeams.length > 0 && !baseTeams.some((team) => team.is_default)) {
      baseTeams[0].is_default = true
    }

    return {
      name: form.name.trim(),
      access_token: form.access_token.trim(),
      token_expires_at: form.token_expires_at ? new Date(form.token_expires_at).toISOString() : null,
      notes: form.notes.trim() || undefined,
      teams: baseTeams,
    }
  }, [])

  const refreshMothers = useCallback(() => {
    void loadMothers({
      page: state.mothersPage,
      pageSize: state.mothersPageSize,
    })
  }, [loadMothers, state.mothersPage, state.mothersPageSize])

  useEffect(() => {
    void loadMothers({ page: state.mothersPage, pageSize: state.mothersPageSize })
  }, [loadMothers, state.mothersPage, state.mothersPageSize])

  useAdminAutoRefresh(refreshMothers, true)

  const handleRefresh = useCallback(() => {
    refreshMothers()
  }, [refreshMothers])

  const handleCreateMother = useCallback(
    async (form: MotherFormState) => {
      const payload = buildMotherPayload(form)
      if (!payload.name) {
        throw new Error('母号名称不能为空')
      }
      if (!payload.access_token || payload.access_token.length < 10) {
        throw new Error('访问令牌长度至少 10 位')
      }

      setCreateLoading(true)
      setFormError(null)
      try {
        const token = await ensureCsrfToken()
        const response = await fetch('/api/admin/mothers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
            'X-Request-Source': 'nextjs-frontend',
            'X-Domain': 'pool',
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data?.message || data?.detail || '创建母号失败')
        }

        notifications.addNotification({
          type: 'success',
          title: '创建成功',
          message: `${payload.name} 已录入`,
        })
        resetCsrfToken()
        setCreateDialogOpen(false)
        setMotherForm(getEmptyMotherFormState())
        await loadMothers({ page: state.mothersPage, pageSize: state.mothersPageSize })
      } catch (error) {
        const message = error instanceof Error ? error.message : '创建母号失败'
        setFormError(message)
        notifications.addNotification({
          type: 'error',
          title: '创建母号失败',
          message,
        })
        throw error
      } finally {
        setCreateLoading(false)
      }
    },
    [
      buildMotherPayload,
      ensureCsrfToken,
      loadMothers,
      notifications,
      resetCsrfToken,
      state.mothersPage,
      state.mothersPageSize,
    ],
  )

  const handleEditMother = useCallback(
    async (motherId: number, form: MotherFormState) => {
      const payload = buildMotherPayload(form)
      if (!payload.name) {
        throw new Error('母号名称不能为空')
      }

      setEditLoading(true)
      setFormError(null)
      try {
        const token = await ensureCsrfToken()
        const response = await fetch(`/api/admin/mothers/${motherId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
            'X-Request-Source': 'nextjs-frontend',
            'X-Domain': 'pool',
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data?.message || data?.detail || '更新母号失败')
        }

        notifications.addNotification({
          type: 'success',
          title: '更新成功',
          message: `${payload.name} 已更新`,
        })
        resetCsrfToken()
        setEditDialogOpen(false)
        setEditingMother(null)
        await loadMothers({ page: state.mothersPage, pageSize: state.mothersPageSize })
      } catch (error) {
        const message = error instanceof Error ? error.message : '更新母号失败'
        setFormError(message)
        notifications.addNotification({
          type: 'error',
          title: '更新母号失败',
          message,
        })
        throw error
      } finally {
        setEditLoading(false)
      }
    },
    [
      buildMotherPayload,
      ensureCsrfToken,
      loadMothers,
      notifications,
      resetCsrfToken,
      state.mothersPage,
      state.mothersPageSize,
    ],
  )

  const handleDeleteMother = useCallback(
    async (motherId: number) => {
      try {
        const token = await ensureCsrfToken()
        const response = await fetch(`/api/admin/mothers/${motherId}`, {
          method: 'DELETE',
          headers: {
            'X-CSRF-Token': token,
            'X-Request-Source': 'nextjs-frontend',
            'X-Domain': 'pool',
          },
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data?.message || data?.detail || '删除母号失败')
        }

        notifications.addNotification({
          type: 'success',
          title: '母号已删除',
          message: `母号 #${motherId} 已删除`,
        })
        resetCsrfToken()
        await loadMothers({ page: state.mothersPage, pageSize: state.mothersPageSize })
      } catch (error) {
        const message = error instanceof Error ? error.message : '删除母号失败'
        notifications.addNotification({
          type: 'error',
          title: '删除失败',
          message,
        })
      }
    },
    [
      ensureCsrfToken,
      loadMothers,
      notifications,
      resetCsrfToken,
      state.mothersPage,
      state.mothersPageSize,
    ],
  )

  const handleCopyMotherName = useCallback(
    async (mother: MotherAccount) => {
      try {
        await navigator.clipboard.writeText(mother.name)
        notifications.addNotification({
          type: 'success',
          title: '复制成功',
          message: `${mother.name} 已复制到剪贴板`,
          duration: 2000,
        })
      } catch (error) {
        notifications.addNotification({
          type: 'error',
          title: '复制失败',
          message: '无法访问剪贴板，请手动复制',
          duration: 3000,
        })
      }
    },
    [notifications],
  )

  const handleCreateDialogOpen = useCallback(() => {
    setMotherForm(getEmptyMotherFormState())
    setFormError(null)
    setCreateDialogOpen(true)
  }, [])

  const handleEditDialogOpen = useCallback((mother: PoolMotherAccount) => {
    setEditingMother(mother)
    setFormError(null)
    setMotherForm({
      name: mother.name,
      access_token: '',
      token_expires_at: mother.token_expires_at
        ? new Date(mother.token_expires_at).toISOString().slice(0, 16)
        : '',
      notes: mother.notes || '',
      teams:
        mother.teams.length > 0
          ? mother.teams.map((team, index) => ({
              team_id: team.team_id,
              team_name: team.team_name || '',
              is_enabled: team.is_enabled,
              is_default: index === 0 ? true : team.is_default,
            }))
          : getEmptyMotherFormState().teams,
    })
    setEditDialogOpen(true)
  }, [])

  const handlePageChange = useCallback(
    (page: number) => {
      const nextPage = Math.max(1, page)
      // 直接触发加载（分页状态由 Pool store 内部保存）
      void loadMothers({ page: nextPage, pageSize: state.mothersPageSize })
    },
    [loadMothers, state.mothersPageSize],
  )

  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      const nextPageSize = Math.max(1, Math.min(pageSize, 200))
      void loadMothers({ page: 1, pageSize: nextPageSize })
    },
    [loadMothers],
  )

  const motherFormUpdater = useCallback(
    (updater: (prev: MotherFormState) => MotherFormState) => {
      setMotherForm((prev) => updater(prev))
    },
    [],
  )

  const mothers = useMemo(() => state.mothers, [state.mothers])

  return (
    <div className="space-y-6">
      <MothersSection
        mothers={mothers}
        loading={state.mothersLoading}
        onCreateMother={handleCreateDialogOpen}
        onRefresh={handleRefresh}
        onEditMother={handleEditDialogOpen}
        onCopyMotherName={handleCopyMotherName}
        onDeleteMother={handleDeleteMother}
      />

      <PaginationControls
        page={state.mothersPage}
        pageSize={state.mothersPageSize}
      total={state.mothersTotal}
      loading={state.mothersLoading}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
    />

      <MotherFormDialog
        mode="create"
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open) {
            setMotherForm(getEmptyMotherFormState())
            setFormError(null)
          }
        }}
        form={motherForm}
        onFormChange={motherFormUpdater}
        onSubmit={handleCreateMother}
        loading={createLoading}
        error={formError}
      />

      <MotherFormDialog
        mode="edit"
        open={editDialogOpen && !!editingMother}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) {
            setEditingMother(null)
            setFormError(null)
            setMotherForm(getEmptyMotherFormState())
          }
        }}
        form={motherForm}
        onFormChange={motherFormUpdater}
        onSubmit={async (form) => {
          if (!editingMother) return
          await handleEditMother(editingMother.id, form)
        }}
        loading={editLoading}
        error={formError}
      />
    </div>
  )
}
