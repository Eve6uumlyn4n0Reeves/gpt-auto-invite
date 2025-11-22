import { poolAdminRequest } from '@/lib/api/admin-client'
import { type PoolGroupSummary, type PoolGroupSettingsPayload } from '@/shared/api-types'

export type PoolGroup = PoolGroupSummary
export type PoolGroupSettingsIn = PoolGroupSettingsPayload

export async function listPoolGroups() {
  return poolAdminRequest<PoolGroupSummary[]>('/pool-groups')
}

export async function createPoolGroup(payload: { name: string; description?: string | null }) {
  return poolAdminRequest<PoolGroupSummary>('/pool-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updatePoolGroupSettings(groupId: number, payload: PoolGroupSettingsIn) {
  return poolAdminRequest(`/pool-groups/${groupId}/settings`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function previewPoolGroupNames(groupId: number) {
  return poolAdminRequest<{ examples: string[] }>(`/pool-groups/${groupId}/preview`)
}

export async function enqueueSyncMother(groupId: number, motherId: number) {
  return poolAdminRequest<{ success: boolean; job_id: number }>(`/pool-groups/${groupId}/sync/mother/${motherId}`, {
    method: 'POST',
  })
}

export async function enqueueSyncAll(groupId: number) {
  return poolAdminRequest<{ success: boolean; count: number; job_ids: number[] }>(`/pool-groups/${groupId}/sync/all`, {
    method: 'POST',
  })
}
