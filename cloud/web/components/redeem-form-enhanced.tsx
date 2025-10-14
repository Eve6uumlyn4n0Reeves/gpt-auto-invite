'use client'

import React, { useState, useCallback } from 'react'
import { EnhancedButton } from '@/components/ui/enhanced-button'
import { EnhancedCard } from '@/components/ui/enhanced-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, AlertCircle, Loader2, Mail, Key, RefreshCw, Shield, Zap } from 'lucide-react'

interface RedeemResponse {
  success: boolean
  message: string
  invite_request_id?: number
  mother_id?: number
  team_id?: string
}

export const RedeemFormEnhanced: React.FC = () => {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<RedeemResponse | null>(null)
  const [showResend, setShowResend] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<'code' | 'email' | null>(null)

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
      const response = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), email: email.trim() }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }

      const data: RedeemResponse = await response.json()
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
      const response = await fetch('/api/redeem/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), team_id: result.team_id }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setResult({ success: data.success, message: data.message, team_id: result.team_id })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '重发失败'
      setError(errorMessage)
    } finally {
      setResending(false)
    }
  }

  const getIconForField = (field: 'code' | 'email') => {
    switch (field) {
      case 'code':
        return <Key className="w-4 h-4" />
      case 'email':
        return <Mail className="w-4 h-4" />
      default:
        return null
    }
  }

  const isFormValid = code.trim().length >= 6 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  return (
    <div className="w-full max-w-xl mx-auto space-y-6 select-text">
      <EnhancedCard className="shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-brand-secondary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent">
            兑换您的席位
          </CardTitle>
          <CardDescription className="text-muted-foreground text-base leading-relaxed mt-1">
            输入您的兑换码和邮箱地址，我们将自动为您分配最优的团队席位
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={onSubmit} className="space-y-6">
            {/* Code Input */}
            <div className="space-y-2">
              <Label htmlFor="code" className="flex items-center space-x-2 text-sm font-medium">
                {getIconForField('code')}
                <span>兑换码</span>
              </Label>
              <div className="relative">
                <Input
                  id="code"
                  type="text"
                  placeholder="请输入您的兑换码"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onFocus={() => setFocusedField('code')}
                  onBlur={() => setFocusedField(null)}
                  disabled={submitting}
                  required
                  maxLength={32}
                  className={`pr-10 transition-all duration-200 ${
                    focusedField === 'code'
                      ? 'ring-2 ring-primary/20 border-primary/50'
                      : 'border-border/60'
                  } ${submitting ? 'opacity-50' : ''}`}
                />
                {code && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className={`w-2 h-2 rounded-full ${
                      code.length >= 6 ? 'bg-green-500' : 'bg-yellow-500'
                    }`}></div>
                  </div>
                )}
              </div>
            </div>

            {/* Email Input */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center space-x-2 text-sm font-medium">
                {getIconForField('email')}
                <span>邮箱地址</span>
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="请输入您的邮箱地址"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  disabled={submitting}
                  required
                  className={`pr-10 transition-all duration-200 ${
                    focusedField === 'email'
                      ? 'ring-2 ring-primary/20 border-primary/50'
                      : 'border-border/60'
                  } ${submitting ? 'opacity-50' : ''}`}
                />
                {email && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className={`w-2 h-2 rounded-full ${
                      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
                        ? 'bg-green-500'
                        : 'bg-yellow-500'
                    }`}></div>
                  </div>
                )}
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert className="border-red-500/50 bg-red-500/10 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-600 text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <EnhancedButton
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-200"
              disabled={!isFormValid || submitting}
              loading={submitting}
              icon={<Zap className="w-4 h-4" />}
            >
              {submitting ? '处理中...' : '立即兑换席位'}
            </EnhancedButton>
          </form>

          {/* Result Alert */}
          {result && (
            <Alert
              className={`mt-4 animate-fade-in ${
                result.success
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-red-500/50 bg-red-500/10'
              }`}
            >
              {result.success ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600" />
              )}
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}

          {/* Resend Section */}
          {showResend && result?.success && (
            <div className="text-center space-y-3 pt-4 border-t border-border/40">
              <p className="text-sm text-muted-foreground">
                没有收到邀请邮件？
              </p>
              <EnhancedButton
                variant="outline"
                onClick={handleResend}
                disabled={resending}
                loading={resending}
                icon={<RefreshCw className="w-4 h-4" />}
                className="w-full"
              >
                {resending ? '重发中...' : '重新发送邀请'}
              </EnhancedButton>
            </div>
          )}
        </CardContent>
      </EnhancedCard>

      {/* Security Note */}
      <div className="text-center p-4 rounded-lg border border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center justify-center space-x-2 text-xs text-muted-foreground">
          <Shield className="w-4 h-4" />
          <span>您受到企业级安全保护，我们承诺不会泄露任何个人数据</span>
        </div>
      </div>
    </div>
  )
}
