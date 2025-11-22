'use client'

import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listPoolGroups, createPoolGroup, updatePoolGroupSettings, previewPoolGroupNames, enqueueSyncAll, type PoolGroup } from '@/lib/api/pool-groups'
import { usePoolActions, usePoolSelector } from '@/domains/pool/store'

const groupsKey = ['pool', 'groups'] as const

export const usePoolGroups = () => {
  const state = usePoolSelector((s) => s)
  const actions = usePoolActions()
  const qc = useQueryClient()

  const groupsQuery = useQuery({
    queryKey: groupsKey,
    queryFn: async () => {
      const res = await listPoolGroups()
      if (!('ok' in res) || !res.ok) throw new Error(res.error || '加载号池组失败')
      return (res.data ?? []) as PoolGroup[]
    },
  })

  useEffect(() => {
    actions.setPoolGroupsLoading(groupsQuery.isFetching)
  }, [actions, groupsQuery.isFetching])

  useEffect(() => {
    if (groupsQuery.isSuccess) {
      actions.setPoolGroups(groupsQuery.data)
      if (!state.selectedGroupId && groupsQuery.data.length) {
        actions.setSelectedGroup(groupsQuery.data[0].id)
      }
      actions.setPoolGroupsInitialized(true)
    }
  }, [actions, groupsQuery.isSuccess, groupsQuery.data, state.selectedGroupId])

  const refreshGroups = useCallback(async () => {
    const data = await qc.fetchQuery({ queryKey: groupsKey, queryFn: async () => {
      const res = await listPoolGroups()
      if (!('ok' in res) || !res.ok) throw new Error(res.error || '加载号池组失败')
      return (res.data ?? []) as PoolGroup[]
    } })
    actions.setPoolGroups(data)
    return data
  }, [actions, qc])

  const create = useCallback(async (name: string, description?: string | null) => {
    actions.setCreating(true)
    try {
      const res = await createPoolGroup({ name, description: description ?? undefined })
      if (!('ok' in res) || !res.ok) throw new Error(res.error || '创建号池组失败')
      await refreshGroups()
      return true
    } finally {
      actions.setCreating(false)
    }
  }, [actions, refreshGroups])

  const saveSettings = useCallback(async () => {
    if (!state.selectedGroupId) return false
    actions.setSaving(true)
    try {
      const res = await updatePoolGroupSettings(state.selectedGroupId, {
        team_template: state.teamTemplate || undefined,
        child_name_template: state.childNameTemplate || undefined,
        child_email_template: state.childEmailTemplate || undefined,
        email_domain: state.emailDomain || undefined,
        is_active: true,
      })
      if (!('ok' in res) || !res.ok) throw new Error(res.error || '保存失败')
      const preview = await previewPoolGroupNames(state.selectedGroupId)
      if ('ok' in preview && preview.ok) {
        actions.setPreview(preview.data?.examples || [])
      }
      return true
    } finally {
      actions.setSaving(false)
    }
  }, [actions, state.childEmailTemplate, state.childNameTemplate, state.emailDomain, state.selectedGroupId, state.teamTemplate])

  const syncAll = useCallback(async () => {
    if (!state.selectedGroupId) return { ok: false }
    const res = await enqueueSyncAll(state.selectedGroupId)
    if (!('ok' in res) || !res.ok) return { ok: false, error: res.error }
    return { ok: true, count: res.data?.count || 0 }
  }, [state.selectedGroupId])

  return {
    refreshGroups,
    create,
    saveSettings,
    syncAll,
  }
}
