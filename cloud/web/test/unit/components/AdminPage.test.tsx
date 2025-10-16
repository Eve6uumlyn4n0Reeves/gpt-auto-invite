import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminPage } from '@/components/admin/admin-page'
import { AdminProvider, type AdminState, type StatsData } from '@/store/admin-context'
import type { AdminTab } from '@/lib/admin-navigation'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/mothers',
  redirect: vi.fn(),
}))

const lifecycleMock = vi.fn()
const loadStatsMock = vi.fn()

vi.mock('@/hooks/use-admin-lifecycle', () => ({
  useAdminLifecycle: (view: string) =>
    lifecycleMock(view) ?? { isCheckingAuth: false, isAuthenticated: true, currentTab: view },
}))

vi.mock('@/hooks/use-admin-simple', () => ({
  useAdminSimple: () => ({
    loadStats: loadStatsMock,
  }),
}))

const baseStats: StatsData = {
  total_codes: 10,
  used_codes: 6,
  pending_invites: 3,
  successful_invites: 7,
  total_users: 12,
  active_teams: 4,
  usage_rate: 0.5,
  recent_activity: [],
  status_breakdown: {},
  mother_usage: [],
}

const renderAdminPage = (view: AdminTab = 'mothers', initialState?: Partial<AdminState>) =>
  render(
    <AdminProvider initialState={initialState}>
      <AdminPage view={view}>
        <div data-testid="view-content" />
      </AdminPage>
    </AdminProvider>,
  )

describe('AdminPage', () => {
  beforeEach(() => {
    lifecycleMock.mockReturnValue({
      isCheckingAuth: false,
      isAuthenticated: true,
      currentTab: 'mothers',
    })
    loadStatsMock.mockReset()
  })

  afterEach(() => {
    lifecycleMock.mockReset()
  })

  it('renders loading indicator while checking authentication', () => {
    lifecycleMock.mockReturnValue({
      isCheckingAuth: true,
      isAuthenticated: false,
      currentTab: 'mothers',
    })

    renderAdminPage('mothers')

    expect(screen.getByText('正在检查登录状态…')).toBeInTheDocument()
  })

  it('shows login form when user is not authenticated', () => {
    lifecycleMock.mockReturnValue({
      isCheckingAuth: false,
      isAuthenticated: false,
      currentTab: 'mothers',
    })

    renderAdminPage('mothers')

    expect(screen.getByText('管理员登录')).toBeInTheDocument()
  })

  it('renders stats when authenticated', () => {
    lifecycleMock.mockReturnValue({
      isCheckingAuth: false,
      isAuthenticated: true,
      currentTab: 'overview',
    })

    renderAdminPage('overview', {
      authenticated: true,
      stats: baseStats,
    })

    expect(screen.getByText('总兑换码')).toBeInTheDocument()
    expect(screen.getByText('总用户')).toBeInTheDocument()
    expect(loadStatsMock).toHaveBeenCalled()
  })

  it('renders error alert when state.error is present', () => {
    lifecycleMock.mockReturnValue({
      isCheckingAuth: false,
      isAuthenticated: true,
      currentTab: 'overview',
    })

    renderAdminPage('overview', {
      authenticated: true,
      stats: baseStats,
      error: '出错了',
    })

    expect(screen.getByText('出错了')).toBeInTheDocument()
  })

  it('shows filters for filterable views', () => {
    lifecycleMock.mockReturnValue({
      isCheckingAuth: false,
      isAuthenticated: true,
      currentTab: 'users',
    })

    renderAdminPage('users', {
      authenticated: true,
      stats: baseStats,
    })

    expect(screen.getByPlaceholderText('搜索用户、兑换码、团队...')).toBeInTheDocument()
  })
})
