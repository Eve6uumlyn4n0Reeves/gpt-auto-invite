import { usersAdminRequest } from '@/lib/api/admin-client'
import type { QuotaSnapshot } from '@/types/admin'

export async function getQuota() {
  return usersAdminRequest<QuotaSnapshot>('/quota')
}

