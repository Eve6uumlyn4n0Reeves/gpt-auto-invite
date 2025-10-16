export const getAdminApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return ''
  }

  return process.env.BACKEND_URL || 'http://localhost:8000'
}

export interface AdminRequestOptions extends RequestInit {
  skipJson?: boolean
}

export async function adminRequest<T>(endpoint: string, options: AdminRequestOptions = {}) {
  const baseUrl = getAdminApiBaseUrl()
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = normalizedEndpoint.startsWith('/api/admin')
    ? `${baseUrl}${normalizedEndpoint}`
    : `${baseUrl}/api/admin${normalizedEndpoint}`

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Source': 'nextjs-frontend',
      ...options.headers,
    },
    ...options,
  })

  if (options.skipJson) {
    return { response }
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error =
      (data && (data.message || data.detail)) || `HTTP ${response.status} ${response.statusText}`
    return { response, ok: false as const, error }
  }

  return { response, ok: true as const, data: data as T }
}
