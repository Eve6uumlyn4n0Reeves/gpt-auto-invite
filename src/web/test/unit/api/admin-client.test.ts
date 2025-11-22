import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usersAdminRequest } from '@/lib/api/admin-client'

describe('admin-client CSRF handling', () => {
  const originalFetch = global.fetch
  const originalEnv = process.env.BACKEND_URL

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.BACKEND_URL = 'http://backend.test'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.BACKEND_URL = originalEnv
  })

  it('returns ok=false when CSRF token cannot be obtained for non-GET', async () => {
    // First call: CSRF endpoint -> respond 200 but no token
    // Second call would be skipped because client returns early when header missing
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }) as any,
    )

    const res = await usersAdminRequest('/test', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    expect('ok' in res && res.ok).toBe(false)
    // @ts-ignore
    expect(res.error).toMatch(/CSRF/)
  })
})

