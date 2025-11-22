import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleRedeem } from '@/domains/redeem/handler'

// Helper to build a minimal NextRequest-like object
function buildRequest(body: any): any {
  const req = new Request('http://localhost/api/public/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return req as any // cast to NextRequest-compatible
}

describe('redeem handler', () => {
  const originalFetch = global.fetch
  const originalEnv = process.env.BACKEND_URL

  beforeEach(() => {
    process.env.BACKEND_URL = 'http://backend.test'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
    process.env.BACKEND_URL = originalEnv
  })

  it('returns success json on backend ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, message: 'ok', invite_request_id: 1, mother_id: 2, team_id: 't' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ) as any,
    )

    const req = buildRequest({ code: 'ABC123', email: 'u@e.com' })
    const res = await handleRedeem(req as any, { successMessage: 'success' })
    const json = await (res as Response).json()
    expect(json.success).toBe(true)
    expect(json.message).toBeDefined()
    expect(json.invite_request_id).toBe(1)
  })

  it('propagates backend error message and status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, message: 'bad' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }) as any,
    )

    const req = buildRequest({ code: 'BAD', email: 'u@e.com' })
    const res = await handleRedeem(req as any, { failureMessage: 'failed' })
    expect((res as Response).status).toBe(400)
    const json = await (res as Response).json()
    expect(json.success).toBe(false)
    expect(json.message).toBeDefined()
  })
})

