import { usersAdminRequest } from '@/lib/api/admin-client'

export async function importCookie(payload: { cookie: string }) {
  return usersAdminRequest<{ success?: boolean; message?: string; token?: string; expires_at?: string }>('/import-cookie', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function logoutAll() {
  return usersAdminRequest<{ success: boolean; message?: string }>('/logout-all', {
    method: 'POST',
  })
}

export interface RateLimitPolicy {
  windowMs: number
  maxRequests: number
}

export interface AdminSettingsOut {
  rate_limit_policies: {
    redeem: RateLimitPolicy
    admin: RateLimitPolicy
    ingest: RateLimitPolicy
    resend_ip: RateLimitPolicy
    resend_email: RateLimitPolicy
  }
  cookie_policy: {
    minLength: number
    requiredKeys: string[]
    notes?: string
  }
}

export async function fetchAdminSettings() {
  return usersAdminRequest<AdminSettingsOut>('/settings', { method: 'GET' })
}
