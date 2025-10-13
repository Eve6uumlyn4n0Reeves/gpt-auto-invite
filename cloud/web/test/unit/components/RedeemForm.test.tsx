import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RedeemForm } from '@/components/redeem-form'

// Mock API
const mockRedeem = vi.fn()
vi.mock('@/hooks/use-api', () => ({
  useRedeem: () => ({
    redeem: mockRedeem,
    isLoading: false,
    error: null
  })
}))

// Mock toast
const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast
  })
}))

describe('RedeemForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form with email input and submit button', () => {
    render(<RedeemForm />)

    expect(screen.getByLabelText(/邮箱/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /兑换/i })).toBeInTheDocument()
  })

  it('validates email format', async () => {
    const user = userEvent.setup()
    render(<RedeemForm />)

    const emailInput = screen.getByLabelText(/邮箱/i)
    const submitButton = screen.getByRole('button', { name: /兑换/i })

    // 输入无效邮箱
    await user.type(emailInput, 'invalid-email')
    await user.click(submitButton)

    // 应该显示错误信息
    await waitFor(() => {
      expect(screen.getByText(/请输入有效的邮箱地址/i)).toBeInTheDocument()
    })
  })

  it('submits form with valid email', async () => {
    const user = userEvent.setup()
    mockRedeem.mockResolvedValue({ success: true })

    render(<RedeemForm />)

    const emailInput = screen.getByLabelText(/邮箱/i)
    const submitButton = screen.getByRole('button', { name: /兑换/i })

    // 输入有效邮箱
    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockRedeem).toHaveBeenCalledWith({
        email: 'test@example.com',
        code: '' // 如果有兑换码输入字段
      })
    })
  })

  it('shows loading state during submission', async () => {
    const user = userEvent.setup()
    mockRedeem.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)))

    render(<RedeemForm />)

    const emailInput = screen.getByLabelText(/邮箱/i)
    const submitButton = screen.getByRole('button', { name: /兑换/i })

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    // 应该显示加载状态
    expect(screen.getByText(/兑换中/i)).toBeInTheDocument()
    expect(submitButton).toBeDisabled()
  })

  it('shows success message on successful redemption', async () => {
    const user = userEvent.setup()
    mockRedeem.mockResolvedValue({
      success: true,
      message: '兑换成功！',
      inviteId: 'invite-123'
    })

    render(<RedeemForm />)

    const emailInput = screen.getByLabelText(/邮箱/i)
    const submitButton = screen.getByRole('button', { name: /兑换/i })

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: '兑换成功',
        description: '兑换成功！',
        variant: 'default'
      })
    })
  })

  it('shows error message on failed redemption', async () => {
    const user = userEvent.setup()
    mockRedeem.mockRejectedValue(new Error('兑换码无效'))

    render(<RedeemForm />)

    const emailInput = screen.getByLabelText(/邮箱/i)
    const submitButton = screen.getByRole('button', { name: /兑换/i })

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: '兑换失败',
        description: '兑换码无效',
        variant: 'destructive'
      })
    })
  })

  it('clears form after successful submission', async () => {
    const user = userEvent.setup()
    mockRedeem.mockResolvedValue({ success: true })

    render(<RedeemForm />)

    const emailInput = screen.getByLabelText(/邮箱/i)
    const submitButton = screen.getByRole('button', { name: /兑换/i })

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    await waitFor(() => {
      expect(emailInput).toHaveValue('')
    })
  })

  it('disables submit button when email is empty', () => {
    render(<RedeemForm />)

    const submitButton = screen.getByRole('button', { name: /兑换/i })
    expect(submitButton).toBeDisabled()
  })

  it('enables submit button when email is valid', async () => {
    const user = userEvent.setup()
    render(<RedeemForm />)

    const emailInput = screen.getByLabelText(/邮箱/i)
    const submitButton = screen.getByRole('button', { name: /兑换/i })

    await user.type(emailInput, 'test@example.com')

    expect(submitButton).toBeEnabled()
  })
})