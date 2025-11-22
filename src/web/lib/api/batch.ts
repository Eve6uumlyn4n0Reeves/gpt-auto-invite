import { usersAdminRequest } from '@/lib/api/admin-client'

export interface BatchSupportedActions {
  users: string[]
  codes: string[]
}

export async function getSupportedBatchActions() {
  return usersAdminRequest<BatchSupportedActions>('/batch/supported-actions')
}

