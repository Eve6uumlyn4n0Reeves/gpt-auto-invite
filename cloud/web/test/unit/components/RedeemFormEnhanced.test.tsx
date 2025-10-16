import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RedeemForm } from '@/components/redeem-form'
import { server } from '../../mocks/server'
import { http, HttpResponse } from 'msw'

const validCode = 'ABCD1234'
const validEmail = 'test@example.com'

describe('RedeemFormEnhanced', () => {
  beforeEach(() => {
    // 每个测试都会在 test/setup.ts 中 resetHandlers
  })

  it('初始状态渲染表单并禁用提交按钮', () => {
    render(<RedeemForm />)

    expect(screen.getByLabelText(/兑换码/)).toBeInTheDocument()
    expect(screen.getByLabelText(/邮箱地址/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /立即兑换席位/ })).toBeDisabled()
  })

  it('校验输入并提示错误信息', async () => {
    const user = userEvent.setup()
    render(<RedeemForm />)

    const codeInput = screen.getByLabelText(/兑换码/)
    const emailInput = screen.getByLabelText(/邮箱地址/)
    const form = screen.getByTestId('redeem-form')

    await user.type(codeInput, 'short')
    await user.type(emailInput, 'invalid-email')
    fireEvent.submit(form)

    const errorAlert = await screen.findByTestId('redeem-error')
    expect(errorAlert).toHaveTextContent('兑换码长度需为 8-32 位且仅包含字母与数字')
    expect(errorAlert).toHaveTextContent('邮箱格式不正确')
  })

  it('在输入有效信息后启用提交按钮', async () => {
    const user = userEvent.setup()
    render(<RedeemForm />)

    const codeInput = screen.getByLabelText(/兑换码/)
    const emailInput = screen.getByLabelText(/邮箱地址/)
    const submitButton = screen.getByRole('button', { name: /立即兑换席位/ })

    await user.type(codeInput, validCode)
    await user.type(emailInput, validEmail)

    expect(submitButton).toBeEnabled()
  })

  it('提交表单时调用兑换接口并展示成功信息', async () => {
    const user = userEvent.setup()
    let capturedBody: Record<string, unknown> | null = null

    server.use(
      http.post('/api/redeem', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({
          success: true,
          message: '兑换成功！',
          team_id: 'team-1',
        })
      }),
    )

    render(<RedeemForm />)

    const codeInput = screen.getByLabelText(/兑换码/)
    const emailInput = screen.getByLabelText(/邮箱地址/)
    const submitButton = screen.getByRole('button', { name: /立即兑换席位/ })

    await user.type(codeInput, validCode)
    await user.type(emailInput, validEmail)
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('兑换成功！')).toBeInTheDocument()
    })
    expect(capturedBody).toEqual({ code: validCode, email: validEmail })
  })

  it('当服务器返回错误时显示错误提示', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/redeem', () =>
        HttpResponse.json(
          {
            success: false,
            message: '兑换码无效',
          },
          { status: 400 },
        ),
      ),
    )

    render(<RedeemForm />)

    const codeInput = screen.getByLabelText(/兑换码/)
    const emailInput = screen.getByLabelText(/邮箱地址/)
    const submitButton = screen.getByRole('button', { name: /立即兑换席位/ })

    await user.type(codeInput, validCode)
    await user.type(emailInput, validEmail)
    await user.click(submitButton)

    const errorAlert = await screen.findByTestId('redeem-error')
    expect(errorAlert).toHaveTextContent('兑换码无效')
  })
})
