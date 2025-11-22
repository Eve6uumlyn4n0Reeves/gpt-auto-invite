'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAdminContext, useAdminActions } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { useMobileGestures } from '@/hooks/use-mobile-gestures'

export const AdminLoginForm: React.FC = () => {
  const { state } = useAdminContext()
  const { setLoginPassword, setLoginError, setShowPassword } = useAdminActions()
  const { login } = useAdminSimple()
  const { isTouch } = useMobileGestures()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!state.loginPassword.trim()) return

    setLoginError('')

    const result = await login(state.loginPassword)
    if (!result.success) {
      setLoginError(result.error || '密码错误')
    } else {
      setLoginError('')
    }
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!state.showPassword)
  }

  return (
    <div className="min-h-screen bg-background grid-bg flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/40 bg-card/50 backdrop-blur-sm shadow-xl">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-primary-foreground font-bold text-lg">🔒</span>
          </div>
          <CardTitle className="text-xl sm:text-2xl font-semibold bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent">
            管理员登录
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            请输入管理员密码以访问后台
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                密码
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={state.showPassword ? "text" : "password"}
                  placeholder="请输入管理员密码"
                  value={state.loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className={`pr-10 bg-background/50 border-border/60 focus:ring-2 focus:ring-primary/20 ${
                    isTouch ? "min-h-[44px] text-base" : ""
                  }`}
                  disabled={state.loginLoading}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent focus:bg-transparent"
                  onClick={togglePasswordVisibility}
                  disabled={state.loginLoading}
                >
                  {state.showPassword ? (
                    <span className="text-muted-foreground">👁️</span>
                  ) : (
                    <span className="text-muted-foreground">👁️‍🗨️</span>
                  )}
                </Button>
              </div>
            </div>

            {state.loginError && (
              <Alert className="border-red-500/50 bg-red-500/10 animate-fade-in">
                <AlertDescription className="text-red-600 text-sm">
                  {state.loginError}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className={`w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-200 ${
                isTouch ? "min-h-[48px] text-base" : ""
              }`}
              disabled={state.loginLoading || !state.loginPassword.trim()}
            >
              {state.loginLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>登录中...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>🔓</span>
                  <span>登录</span>
                </div>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              🔒 您的访问受到企业级安全保护
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
