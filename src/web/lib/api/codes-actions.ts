import { usersAdminRequest } from '@/lib/api/admin-client'

export async function batchCodes(payload: { action: string; ids: number[]; confirm?: boolean }) {
  return usersAdminRequest<{ success: boolean; message?: string }>('/batch/codes', {
    method: 'POST',
    body: JSON.stringify({ ...payload, confirm: payload.confirm ?? true }),
  })
}

export async function disableCode(codeId: number) {
  return usersAdminRequest<{ success: boolean; message?: string }>(`/codes/${codeId}/disable`, {
    method: 'POST',
  })
}

