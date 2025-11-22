import { usersAdminRequest } from '@/lib/api/admin-client'

export async function resendInvite(payload: { email: string; team_id: string }) {
  return usersAdminRequest<{ success: boolean; message?: string }>('/resend', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function cancelInvite(payload: { email: string; team_id: string }) {
  return usersAdminRequest<{ success: boolean; message?: string }>('/cancel-invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function removeMember(payload: { email: string; team_id: string }) {
  return usersAdminRequest<{ success: boolean; message?: string }>('/remove-member', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function switchSeat(payload: { email: string; code?: string }) {
  return usersAdminRequest<{ success: boolean; message?: string; queued?: boolean; request_id?: number; team_id?: string }>(
    '/switch',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export async function batchUsers(payload: { action: string; ids: number[]; confirm?: boolean }) {
  return usersAdminRequest<{ success: boolean; processed_count?: number; message?: string }>(
    '/batch/users',
    {
      method: 'POST',
      body: JSON.stringify({ ...payload, confirm: payload.confirm ?? true }),
    },
  )
}

export async function batchUsersAsync(payload: { action: string; ids: number[]; confirm?: boolean }) {
  return usersAdminRequest<{ success: boolean; job_id: number }>(
    '/batch/users/async',
    {
      method: 'POST',
      body: JSON.stringify({ ...payload, confirm: payload.confirm ?? true }),
    },
  )
}

