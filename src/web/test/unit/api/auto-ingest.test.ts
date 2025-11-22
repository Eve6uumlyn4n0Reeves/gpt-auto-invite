import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutoIngestApi } from '@/lib/api/auto-ingest'

vi.mock('@/lib/api/admin-client', () => {
  return {
    poolAdminRequest: vi.fn(async (endpoint: string, options?: any) => {
      if (endpoint.startsWith('/auto-ingest/current-team')) {
        return { ok: true, data: { endpoint } }
      }
      if (endpoint === '/auto-ingest/templates') {
        return { ok: true, data: { pool_groups: [], usage_notes: {} } }
      }
      if (endpoint === '/auto-ingest') {
        return { ok: true, data: { success: true } }
      }
      return { ok: false, error: 'not found' }
    }),
  }
})

describe('AutoIngestApi', () => {
  const api = new AutoIngestApi()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('builds current-team endpoint with query param', async () => {
    const data = await api.getCurrentTeamInfo('cookie=abc; path=/')
    expect(data).toBeDefined()
    // @ts-ignore
    expect(data.endpoint).toContain('/auto-ingest/current-team?cookie_string=')
  })

  it('fetches templates via pool domain', async () => {
    const data = await api.getTemplates()
    expect(Array.isArray(data.pool_groups)).toBe(true)
  })

  it('ingests mother via POST', async () => {
    const data = await api.ingestMother({ cookie_string: 'c=1' })
    expect(data.success).toBe(true)
  })
})

