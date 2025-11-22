'use client'

import { useCallback, useState } from 'react'
import type { QuotaSnapshot } from '@/types/admin'
import { getQuota } from '@/lib/api/quota'

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
      const res = await getQuota()
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '获取配额失败')
      }
      setQuota(res.data as QuotaSnapshot)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取配额失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  return { quota, loading, error, refresh }
}
