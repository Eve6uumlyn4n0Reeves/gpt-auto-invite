import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePaginatedQuery } from '@/hooks/use-paginated-query'

describe('usePaginatedQuery', () => {
  it('returns items and total from fetcher and can refetch', async () => {
    let calls = 0
    const fetchPage = async (page: number, pageSize: number) => {
      calls++
      await new Promise((r) => setTimeout(r, 5))
      const start = (page - 1) * pageSize
      const items = Array.from({ length: pageSize }, (_, i) => ({ id: start + i + 1 }))
      return { items, pagination: { page, page_size: pageSize, total: 50 } }
    }

    const { result } = renderHook(() =>
      usePaginatedQuery<{ id: number }>({
        key: ['x', 1, 10],
        page: 1,
        pageSize: 10,
        fetchPage,
      }),
    )

    expect(result.current.query.isFetching).toBe(true)
    await act(async () => {
      await result.current.query.refetch()
    })

    expect(result.current.items.length).toBe(10)
    expect(result.current.total).toBe(50)
    expect(calls).toBeGreaterThanOrEqual(1)
  })
})

