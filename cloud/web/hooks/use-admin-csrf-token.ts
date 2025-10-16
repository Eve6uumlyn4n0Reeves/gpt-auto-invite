'use client'

import { useCallback, useState } from 'react'

interface UseAdminCsrfTokenResult {
  csrfToken: string | null
  ensureCsrfToken: () => Promise<string>
  resetCsrfToken: () => void
}

export function useAdminCsrfToken(): UseAdminCsrfTokenResult {
  const [csrfToken, setCsrfToken] = useState<string | null>(null)

  const ensureCsrfToken = useCallback(async () => {
    if (csrfToken) {
      return csrfToken
    }

    const response = await fetch('/api/admin/csrf-token', {
      credentials: 'include',
      headers: {
        'X-Request-Source': 'nextjs-frontend',
      },
    })
    if (!response.ok) {
      throw new Error('无法获取 CSRF token，请重新登录')
    }
    const data = await response.json().catch(() => ({}))
    if (!data?.csrf_token || typeof data.csrf_token !== 'string') {
      throw new Error('CSRF token 返回无效')
    }
    setCsrfToken(data.csrf_token)
    return data.csrf_token
  }, [csrfToken])

  const resetCsrfToken = useCallback(() => {
    setCsrfToken(null)
  }, [])

  return {
    csrfToken,
    ensureCsrfToken,
    resetCsrfToken,
  }
}
