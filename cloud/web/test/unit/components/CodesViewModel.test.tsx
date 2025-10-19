import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AdminProvider } from '@/store/admin-context'
import { QueryProvider } from '@/components/query-provider'
import { useCodesViewModel } from '@/components/admin/views/codes/use-codes-view-model'

vi.mock('@/lib/api/codes', () => ({
  fetchCodes: vi.fn(async () => ({
    ok: true as const,
    data: {
      items: [
        {
          id: 101,
          code: 'ABC-001',
          is_used: false,
          created_at: new Date().toISOString(),
          batch_id: 'b1',
          mother_id: 9,
          mother_name: 'M-9',
          team_id: 't1',
          team_name: 'Team 1',
        },
      ],
      pagination: { page: 1, page_size: 50, total: 1 },
    },
  })),
}))

function CodesProbe() {
  const vm = useCodesViewModel()
  return (
    <div>
      <div>loading:{String(vm.codesLoading)}</div>
      <div>count:{vm.filteredCodes.length}</div>
    </div>
  )
}

describe('useCodesViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads codes via React Query and exposes data', async () => {
    render(
      <QueryProvider>
        <AdminProvider initialState={{ authenticated: true }}>
          <CodesProbe />
        </AdminProvider>
      </QueryProvider>,
    )

    await waitFor(() => expect(screen.getByText(/count:1/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/loading:false/)).toBeInTheDocument())
  })
})

