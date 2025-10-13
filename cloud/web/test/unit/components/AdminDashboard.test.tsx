import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminDashboard } from '@/components/admin-dashboard'

// Mock API hooks
const mockStats = {
  totalCodes: 100,
  usedCodes: 60,
  pendingInvites: 25,
  totalInvites: 85
}

const mockInvites = [
  {
    id: 1,
    email: 'user1@example.com',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 2,
    email: 'user2@example.com',
    status: 'accepted',
    createdAt: '2024-01-02T00:00:00Z'
  }
]

const mockUseStats = vi.fn()
const mockUseInvites = vi.fn()
const mockUseGenerateCodes = vi.fn()

vi.mock('@/hooks/use-admin-api', () => ({
  useStats: () => mockUseStats(),
  useInvites: () => mockUseInvites(),
  useGenerateCodes: () => mockUseGenerateCodes()
}))

// Mock toast
const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast
  })
}))

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseStats.mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    })
    mockUseInvites.mockReturnValue({
      data: { invites: mockInvites, total: 2 },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    })
    mockUseGenerateCodes.mockReturnValue({
      generateCodes: vi.fn(),
      isLoading: false,
      error: null
    })
  })

  it('renders dashboard with statistics', () => {
    render(<AdminDashboard />)

    expect(screen.getByText(/管理面板/i)).toBeInTheDocument()
    expect(screen.getByText(/总兑换码/i)).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText(/已使用/i)).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument()
    expect(screen.getByText(/待处理邀请/i)).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('renders invite list', () => {
    render(<AdminDashboard />)

    expect(screen.getByText(/邀请列表/i)).toBeInTheDocument()
    expect(screen.getByText('user1@example.com')).toBeInTheDocument()
    expect(screen.getByText('user2@example.com')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('accepted')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockUseStats.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: vi.fn()
    })

    render(<AdminDashboard />)

    expect(screen.getByText(/加载中/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockUseStats.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('加载失败'),
      refetch: vi.fn()
    })

    render(<AdminDashboard />)

    expect(screen.getByText(/加载失败/i)).toBeInTheDocument()
  })

  it('opens generate codes modal', async () => {
    const user = userEvent.setup()
    render(<AdminDashboard />)

    const generateButton = screen.getByRole('button', { name: /生成兑换码/i })
    await user.click(generateButton)

    expect(screen.getByText(/生成兑换码/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/数量/i)).toBeInTheDocument()
  })

  it('generates codes successfully', async () => {
    const user = userEvent.setup()
    const mockGenerate = vi.fn().mockResolvedValue({
      batchId: 'batch-123',
      codes: ['CODE1', 'CODE2', 'CODE3']
    })
    mockUseGenerateCodes.mockReturnValue({
      generateCodes: mockGenerate,
      isLoading: false,
      error: null
    })

    render(<AdminDashboard />)

    // 打开模态框
    const generateButton = screen.getByRole('button', { name: /生成兑换码/i })
    await user.click(generateButton)

    // 填写表单
    const countInput = screen.getByLabelText(/数量/i)
    await user.clear(countInput)
    await user.type(countInput, '5')

    // 提交表单
    const submitButton = screen.getByRole('button', { name: /生成/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith({
        count: 5,
        prefix: '',
        expiresAt: null
      })
    })

    expect(mockToast).toHaveBeenCalledWith({
      title: '生成成功',
      description: '成功生成了 5 个兑换码',
      variant: 'default'
    })
  })

  it('filters invites by status', async () => {
    const user = userEvent.setup()
    render(<AdminDashboard />)

    // 点击状态过滤器
    const statusFilter = screen.getByRole('combobox', { name: /状态/i })
    await user.click(statusFilter)

    // 选择 pending 状态
    const pendingOption = screen.getByText('pending')
    await user.click(pendingOption)

    await waitFor(() => {
      expect(mockUseInvites).toHaveBeenCalledWith({
        status: 'pending',
        page: 1,
        size: 10
      })
    })
  })

  it('refreshes data when refresh button is clicked', async () => {
    const user = userEvent.setup()
    const mockRefetchStats = vi.fn()
    const mockRefetchInvites = vi.fn()

    mockUseStats.mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
      refetch: mockRefetchStats
    })
    mockUseInvites.mockReturnValue({
      data: { invites: mockInvites, total: 2 },
      isLoading: false,
      error: null,
      refetch: mockRefetchInvites
    })

    render(<AdminDashboard />)

    const refreshButton = screen.getByRole('button', { name: /刷新/i })
    await user.click(refreshButton)

    await waitFor(() => {
      expect(mockRefetchStats).toHaveBeenCalled()
      expect(mockRefetchInvites).toHaveBeenCalled()
    })
  })

  it('exports data to CSV', async () => {
    const user = userEvent.setup()
    const mockExport = vi.fn().mockResolvedValue('csv,data')

    // Mock export function
    vi.mock('@/lib/export', () => ({
      exportToCSV: mockExport
    }))

    render(<AdminDashboard />)

    const exportButton = screen.getByRole('button', { name: /导出/i })
    await user.click(exportButton)

    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledWith(mockInvites, 'invites.csv')
    })

    expect(mockToast).toHaveBeenCalledWith({
      title: '导出成功',
      description: '数据已成功导出',
      variant: 'default'
    })
  })

  it('shows error when generate codes fails', async () => {
    const user = userEvent.setup()
    const mockGenerate = vi.fn().mockRejectedValue(new Error('生成失败'))
    mockUseGenerateCodes.mockReturnValue({
      generateCodes: mockGenerate,
      isLoading: false,
      error: null
    })

    render(<AdminDashboard />)

    // 打开模态框
    const generateButton = screen.getByRole('button', { name: /生成兑换码/i })
    await user.click(generateButton)

    // 提交表单
    const submitButton = screen.getByRole('button', { name: /生成/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: '生成失败',
        description: '生成失败',
        variant: 'destructive'
      })
    })
  })

  it('validates generate codes form', async () => {
    const user = userEvent.setup()
    render(<AdminDashboard />)

    // 打开模态框
    const generateButton = screen.getByRole('button', { name: /生成兑换码/i })
    await user.click(generateButton)

    // 提交空表单
    const submitButton = screen.getByRole('button', { name: /生成/i })
    await user.click(submitButton)

    // 应该显示验证错误
    await waitFor(() => {
      expect(screen.getByText(/数量必须大于0/i)).toBeInTheDocument()
    })
  })
})