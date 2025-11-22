import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Module under test
import * as CodesActions from '@/lib/api/codes-actions'

// Mock admin-client to capture calls
vi.mock('@/lib/api/admin-client', () => {
  return {
    usersAdminRequest: vi.fn(async (endpoint: string, options?: any) => {
      return { ok: true, data: { endpoint, method: options?.method || 'GET' } }
    }),
  }
})

describe('codes-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('disableCode calls expected endpoint', async () => {
    const res = await CodesActions.disableCode(42)
    expect('ok' in res && res.ok).toBe(true)
    // @ts-ignore mock shape
    expect(res.data.endpoint).toBe('/codes/42/disable')
    // @ts-ignore
    expect(res.data.method).toBe('POST')
  })
})

