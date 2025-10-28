export const getAdminApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return ''
  }

  return process.env.BACKEND_URL || 'http://localhost:8000'
}

export interface AdminRequestOptions extends RequestInit {
  skipJson?: boolean
}

/**
 * @deprecated Prefer `usersAdminRequest` or `poolAdminRequest` for domain-specific APIs.
 * May be used for cross-domain or neutral endpoints like `/stats`.
 */
export async function adminRequest<T>(endpoint: string, options: AdminRequestOptions = {}) {
  const baseUrl = getAdminApiBaseUrl()
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = normalizedEndpoint.startsWith('/api/admin')
    ? `${baseUrl}${normalizedEndpoint}`
    : `${baseUrl}/api/admin${normalizedEndpoint}`

  // 自动附带凭证与 CSRF（对非GET请求）
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Source': 'nextjs-frontend',
    ...(options.headers as Record<string, string>),
  }
  const method = (options.method || 'GET').toUpperCase()
  if (method !== 'GET') {
    try {
      const resp = await fetch(`${baseUrl}/api/admin/csrf-token`, { credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}))
        if (data && typeof data.csrf_token === 'string') {
          headers['X-CSRF-Token'] = data.csrf_token
        }
      }
    } catch (e) {
      // 拉取 CSRF 失败：直接返回统一错误，避免无谓请求
      const errMsg = 'CSRF 校验失败，请刷新后台页面后重试'
      const fake = new Response(null, { status: 0, statusText: 'CSRF' })
      return { response: fake, ok: false as const, error: errMsg, data: null }
    }
    // 若未能获取到 token，也直接失败（统一错误提示）
    if (!headers['X-CSRF-Token']) {
      const errMsg = 'CSRF 校验失败，请刷新后台页面后重试'
      const fake = new Response(null, { status: 0, statusText: 'CSRF' })
      return { response: fake, ok: false as const, error: errMsg, data: null }
    }
  }

  const response = await fetch(url, {
    headers,
    credentials: 'include',
    ...options,
  })

  if (options.skipJson) {
    return { response }
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error =
      (data && (data.message || data.detail))
      || (response.status === 401 ? '未认证或会话失效，请重新登录' : response.status === 403 ? '无权限或 CSRF 校验失败' : `HTTP ${response.status} ${response.statusText}`)
    return { response, ok: false as const, error, data }
  }

  return { response, ok: true as const, data: data as T }
}

// Domain-specific wrappers for logical separation (no routing change).
export async function usersAdminRequest<T>(endpoint: string, options: AdminRequestOptions = {}) {
  const headers = { ...(options.headers as Record<string, string>), 'X-Domain': 'users' }
  return adminRequest<T>(endpoint, { ...options, headers })
}

export async function poolAdminRequest<T>(endpoint: string, options: AdminRequestOptions = {}) {
  const headers = { ...(options.headers as Record<string, string>), 'X-Domain': 'pool' }
  return adminRequest<T>(endpoint, { ...options, headers })
}
