/**
 * 带限流状态显示的兑换表单
 */
'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { EnhancedButton } from '@/components/ui/enhanced-button'
import { EnhancedCard } from '@/components/ui/enhanced-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, AlertCircle, Loader2, Mail, Key, RefreshCw, Shield, Zap, Clock } from 'lucide-react'
import { RateLimitStatusComponent, RateLimitTooltip } from './rate-limit-status'
import { getRateLimitStatus, handleRateLimitedRequest } from '../lib/distributed-rate-limit'

interface RedeemResponse {
  success: boolean
  message: string
  invite_request_id?: number
  mother_id?: number
  team_id?: string
}

export const RedeemFormWithRateLimit: React.FC = () => {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<RedeemResponse | null>(null)
  const [showResend, setShowResend] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<'code' | 'email' | null>(null)
  const [rateLimitKey, setRateLimitKey] = useState<string>('')
  const [clientIP, setClientIP] = useState<string>('')

  // 获取客户端IP用于限流键
  useEffect(() => {
    const getClientIP = async () => {
      try {
        const response = await fetch('/api/client-ip')
        const data = await response.json()
        setClientIP(data.ip || 'unknown')
        setRateLimitKey(`ip:redeem:${data.ip || 'unknown'}`)
      } catch (err) {
        console.warn('Failed to get client IP:', err)
        setClientIP('unknown')
        setRateLimitKey('ip:redeem:unknown')
      }
    }
    getClientIP()
  }, [])

  const validateForm = useCallback(() => {
    const errors = []

    if (!code.trim()) {
      errors.push('请输入兑换码')
    } else if (code.trim().length < 6) {
      errors.push('兑换码长度至少6位')
    }

    if (!email.trim()) {
      errors.push('请输入邮箱地址')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.push('邮箱格式不正确')
    }

    return errors
  }, [code, email])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors = validateForm()
    if (errors.length > 0) {
      setError(errors.join(', '))
      return
    }

    setSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const data = await handleRateLimitedRequest<RedeemResponse>(
        () => fetch('/api/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code.trim(), email: email.trim() }),
        }),
        (retryAfter) => {
          setError(`请求过于频繁，请在 ${retryAfter} 秒后重试`)
        }
      )

      setResult(data)

      if (data.success && data.team_id) {
        setShowResend(true)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '网络错误，请稍后重试'
      setError(errorMessage)
      setResult({ success: false, message: errorMessage })
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (!result?.team_id || !email.trim()) {
      return
    }

    setResending(true)
    try {
      const data = await handleRateLimitedRequest<any>(
        () => fetch('/api/redeem/resend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), team_id: result.team_id }),
        }),
        (retryAfter) => {
          setError(`重发请求过于频繁，请在 ${retryAfter} 秒后重试`)
        }
      )

      setResult({ success: data.success, message: data.message })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '网络错误，请稍后重试'
      setError(errorMessage)
      setResult({ success: false, message: errorMessage })
    } finally {
      setResending(false)
    }
  }

  const resetForm = () => {
    setCode('')
    setEmail('')
    setResult(null)
    setShowResend(false)
    setError(null)
    setFocusedField(null)
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* 限流状态显示 */}
      {rateLimitKey && (
        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Shield className="w-4 h-4 mr-1" />
            限流保护
          </div>
          <RateLimitStatusComponent
            key={rateLimitKey}
            showDetails={false}
            className="mb-4"
          />
        </div>
      )}

      {/* 主要兑换表单 */}
      <EnhancedCard className="w-full">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            兑换邀请码
          </CardTitle>
          <CardDescription className="text-gray-600">
            输入您的兑换码和邮箱地址以获取 GPT Team 邀请
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {!result ? (
            <form onSubmit={onSubmit} className="space-y-6">
              {/* 兑换码输入 */}
              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm font-medium text-gray-700">
                  兑换码
                </Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="code"
                    type="text"
                    placeholder="请输入兑换码"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onFocus={() => setFocusedField('code')}
                    onBlur={() => setFocusedField(null)}
                    className={`pl-10 transition-all duration-200 ${
                      focusedField === 'code'
                        ? 'ring-2 ring-blue-500 border-blue-500'
                        : 'border-gray-300'
                    } ${error ? 'border-red-500' : ''}`}
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* 邮箱输入 */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  邮箱地址
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="请输入邮箱地址"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    className={`pl-10 transition-all duration-200 ${
                      focusedField === 'email'
                        ? 'ring-2 ring-blue-500 border-blue-500'
                        : 'border-gray-300'
                    } ${error ? 'border-red-500' : ''}`}
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* 错误提示 */}
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {/* 提交按钮 */}
              <EnhancedButton
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium py-3"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在兑换...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    兑换邀请码
                  </>
                )}
              </EnhancedButton>
            </form>
          ) : (
            /* 结果显示 */
            <div className="text-center space-y-4">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
                result.success ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {result.success ? (
                  <CheckCircle className="w-8 h-8 text-green-600" />
                ) : (
                  <AlertCircle className="w-8 h-8 text-red-600" />
                )}
              </div>

              <div>
                <h3 className={`text-lg font-semibold ${
                  result.success ? 'text-green-900' : 'text-red-900'
                }`}>
                  {result.success ? '兑换成功！' : '兑换失败'}
                </h3>
                <p className={`mt-2 text-sm ${
                  result.success ? 'text-green-700' : 'text-red-700'
                }`}>
                  {result.message}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {result.success && showResend && (
                  <EnhancedButton
                    onClick={handleResend}
                    disabled={resending}
                    variant="outline"
                    className="flex items-center"
                  >
                    {resending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        重发中...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        重发邮件
                      </>
                    )}
                  </EnhancedButton>
                )}
                <EnhancedButton
                  onClick={resetForm}
                  variant="outline"
                  className="flex items-center"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重新兑换
                </EnhancedButton>
              </div>
            </div>
          )}
        </CardContent>
      </EnhancedCard>

      {/* 使用说明 */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <h4 className="font-medium mb-1">限流保护说明</h4>
              <ul className="space-y-1 text-blue-700">
                <li>• 为保证系统稳定，每个IP地址每小时最多可兑换5次</li>
                <li>• 限流状态会在页面顶部实时显示</li>
                <li>• 如达到限制，请等待限流重置后再次尝试</li>
                <li>• 重发邮件也有独立的频率限制</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
