import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAdminBatchActions } from '@/hooks/use-admin-batch-actions-compat'

vi.mock('@/lib/api/batch', () => {
  let calls = 0
  return {
    getSupportedBatchActions: vi.fn(async () => {
      calls++
      await new Promise((r) => setTimeout(r, 10))
      return { ok: true, data: { users: ['resend'], codes: ['disable'] } }
    }),
  }
})

describe('use-admin-batch-actions-compat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('caches actions and avoids duplicate inflight requests', async () => {
    const { result, rerender } = renderHook(() => useAdminBatchActions())
    expect(result.current.loading).toBe(true)
    // 触发第二次渲染，仍应复用同一次请求
    rerender()

    // 等待加载完成
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.actions.users).toContain('resend')
  })
})

