import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AdminProvider } from '@/store/admin-context'
import { QueryProvider } from '@/components/query-provider'
import { useUsersViewModel } from '@/components/admin/views/users/use-users-view-model'

vi.mock('@/lib/api/users', () => ({
  fetchUsers: vi.fn(async () => ({
    ok: true as const,
    data: {
      items: [
        {
          id: 1,
          email: 'a@example.com',
          status: 'pending',
          invited_at: new Date().toISOString(),
          team_id: 't1',
          team_name: 'Team 1',
        },
      ],
      pagination: { page: 1, page_size: 50, total: 1 },
    },
  })),
}))

function UsersProbe() {
  const vm = useUsersViewModel()
  return (
    <div>
      <div>loading:{String(vm.usersLoading)}</div>
      <div>count:{vm.filteredUsers.length}</div>
    </div>
  )
}

describe('useUsersViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads users via React Query and exposes data', async () => {
    render(
      <QueryProvider>
        <AdminProvider initialState={{ authenticated: true }}>
          <UsersProbe />
        </AdminProvider>
      </QueryProvider>,
    )

    // Initially may be loading; eventually we expect 1 item and loading false
    await waitFor(() => expect(screen.getByText(/count:1/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/loading:false/)).toBeInTheDocument())
  })
})

