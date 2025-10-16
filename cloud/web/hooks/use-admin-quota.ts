'use client'

import { useCallback, useState } from 'react'
import type { QuotaSnapshot } from '@/types/admin'

interface UseAdminQuotaResult {
  quota: QuotaSnapshot | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useAdminQuota(): UseAdminQuotaResult {
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/quota', {
        headers: {
          'X-Request-Source': 'nextjs-frontend',
        },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.detail || '获取配额失败')
      }
      setQuota(data as QuotaSnapshot)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取配额失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  return { quota, loading, error, refresh }
}
