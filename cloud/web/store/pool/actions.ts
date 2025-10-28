'use client'

import type { Dispatch } from 'react'
import type { PoolAction } from './reducer'
import type { PoolMotherAccount } from './types'

export const createPoolActions = (dispatch: Dispatch<PoolAction>) => ({
  setMothersLoading(value: boolean) {
    dispatch({ type: 'POOL_SET_MOTHERS_LOADING', payload: value })
  },
  setMothers(mothers: PoolMotherAccount[]) {
    dispatch({ type: 'POOL_SET_MOTHERS', payload: mothers })
  },
  setMothersPage(page: number) {
    dispatch({ type: 'POOL_SET_MOTHERS_PAGE', payload: page })
  },
  setMothersPageSize(pageSize: number) {
    dispatch({ type: 'POOL_SET_MOTHERS_PAGE_SIZE', payload: pageSize })
  },
  setMothersTotal(total: number) {
    dispatch({ type: 'POOL_SET_MOTHERS_TOTAL', payload: total })
  },
  setMothersInitialized(initialized: boolean) {
    dispatch({ type: 'POOL_SET_MOTHERS_INITIALIZED', payload: initialized })
  },
  // Groups
  setPoolGroups(groups: { id: number; name: string; description?: string | null; is_active: boolean }[]) {
    dispatch({ type: 'POOL_SET_GROUPS', payload: groups })
  },
  setPoolGroupsLoading(v: boolean) {
    dispatch({ type: 'POOL_SET_GROUPS_LOADING', payload: v })
  },
  setPoolGroupsInitialized(v: boolean) {
    dispatch({ type: 'POOL_SET_GROUPS_INITIALIZED', payload: v })
  },
  setSelectedGroup(id: number | null) {
    dispatch({ type: 'POOL_SET_SELECTED_GROUP', payload: id })
  },
  setTemplates(partial: { team?: string; childName?: string; childEmail?: string; domain?: string }) {
    dispatch({ type: 'POOL_SET_TEMPLATES', payload: partial })
  },
  setPreview(examples: string[]) {
    dispatch({ type: 'POOL_SET_PREVIEW', payload: examples })
  },
  setSaving(v: boolean) {
    dispatch({ type: 'POOL_SET_SAVING', payload: v })
  },
  setCreating(v: boolean) {
    dispatch({ type: 'POOL_SET_CREATING', payload: v })
  },
  dispatch,
})
