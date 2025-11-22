import { usersAdminRequest } from '@/lib/api/admin-client'

export async function getPerformanceStats() {
  return usersAdminRequest<any>('/performance/stats')
}

export async function togglePerformance() {
  return usersAdminRequest<{ message?: string }>('/performance/toggle', { method: 'POST' })
}

export async function resetPerformance() {
  return usersAdminRequest<{ message?: string }>('/performance/reset', { method: 'POST' })
}

