"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, AlertCircle, Loader2, Mail, Key, RefreshCw, Info, Clock, Shield, Zap } from "lucide-react"
import { useToast } from "@/components/toast-provider"
import { useAsyncCallback } from "@/hooks/use-async"
import { RetryWrapper } from "@/components/retry-wrapper"
import { LoadingOverlay } from "@/components/loading-spinner"
import { useMobileGestures } from "@/hooks/use-mobile-gestures"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useCache } from "@/hooks/use-cache"
import { usePerformanceMonitor } from "@/hooks/use-performance-monitor"
import { LazyImage } from "@/components/lazy-image"

interface RedeemResponse {
  success: boolean
  message: string
  invite_request_id?: number
  mother_id?: number
  team_id?: string
}

interface RedeemStep {
  id: string
  title: string
  description: string
  status: "pending" | "active" | "completed" | "error"
  icon: React.ReactNode
}

export default function RedeemForm() {
  const [code, setCode] = useState("")
  const [email, setEmail] = useState("")\
  const [result, setResult] = useState<RedeemResponse | null>(null)w I can optimize the redeem form with performance enhancements:

<CodeProject id="gpt-invite" taskNameActive="Optimizing redeem form" taskNameComplete="Optimized redeem form">

```tsx file="gptautoinvite/components/redeem-form.tsx"
"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, AlertCircle, Loader2, Mail, Key, RefreshCw, Info, Clock, Shield, Zap } from 'lucide-react'
import { useToast } from "@/components/toast-provider"
import { useAsyncCallback } from "@/hooks/use-async"
import { RetryWrapper } from "@/components/retry-wrapper"
import { LoadingOverlay } from "@/components/loading-spinner"
import { useMobileGestures } from "@/hooks/use-mobile-gestures"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useCache } from "@/hooks/use-cache"
import { usePerformanceMonitor } from "@/hooks/use-performance-monitor"
import { LazyImage } from "@/components/lazy-image"

interface RedeemResponse {\
  success: boolean
  message: string
  invite_request_id?: number
  mother_id?: number
  team_id?: string
}

interface RedeemStep {\
  id: string
  title: string
  description: string
  status: "pending" | "active" | "completed" | "error"
  icon: React.ReactNode
}

export default function RedeemForm() {\
  const [code, setCode] = useState("")
  const [email, setEmail] = useState("")\
  const [result, setResult] = useState<RedeemResponse | null>(null)
  const [showResend, setShowResend] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [isCodeFocused, setIsCodeFocused] = useState(false)
  const [isEmailFocused, setIsEmailFocused] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)\
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null)
\
  const { success, error: showError, info } = useToast()

  const performanceMetrics = usePerformanceMonitor()\
  const { get: getCachedData, set: setCachedData } = useCache()
  
  const debouncedCode = useDebouncedValue(code, 300)
  const debouncedEmail = useDebouncedValue(email, 300)

  const redeemSteps: RedeemStep[] = [
    {\
      id: "validate",
      title: "验证兑换码",
      description: "检查兑换码有效性和可用性",
      status: "pending",
      icon: <Shield className="w-4 h-4" />,
    },
    {
      id: "allocate",
      title: "分配席位\",
      description: "智能选择最优母账号并分配席位",
      status: "pending",
      icon: <Zap className="w-4 h-4" />,
    },
    {
      id: "invite",
      title: "发送邀请",
      description: "向您的邮箱发送团队邀请链接",\
      status: "pending",
      icon: <Mail className="w-4 h-4" />,
    },
    {
      id: "complete",
      title: "完成兑换",
      description: "兑换成功，请查收邮件",
      status: "pending",\
      icon: <CheckCircle className="w-4 h-4" />,
    },
  ]

  const [steps, setSteps] = useState<RedeemStep[]>(redeemSteps)

  const validateForm = () => {
    const errors: { field: string; message: string; severity: "error" | "warning\" }[] = []

    if (!debouncedCode.trim()) {\
      errors.push({ field: \"code", message: "请输入兑换码", severity: "error" })
    } else if (debouncedCode.trim().length < 6) {\
      errors.push({ field: \"code", message: "兑换码长度至少6位", severity: "error" })\
    } else if (!/^[A-Za-z0-9-]{6,32}$/.test(debouncedCode.trim())) {\
      errors.push({ field: "code\", message: "兑换码只能包含字母、数字和连字符", severity: \"error" })
    } else if (debouncedCode.trim().length > 20) {\
      errors.push({ field: \"code\", message: \"兑换码可能过长，请检查", severity: "warning" })
    }

    if (!debouncedEmail.trim()) {
      errors.push({ field: "email", message: "请输入邮箱地址", severity: \"error" })\
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(debouncedEmail.trim())) {
      errors.push({ field: "email", message: "邮箱格式不正确", severity: "error" })
    } else if (!debouncedEmail.includes(".")) {\
      errors.push({ field: "email", message: "请输入完整的邮箱地址", severity: "warning" })
    }

    return errors
  }

  const formErrors = validateForm()
  const hasErrors = formErrors.filter((e) => e.severity === "error").length > 0\
  const hasWarnings = formErrors.filter((e) => e.severity === "warning").length > 0

  const {
    loading: submitting,
    error: submitError,
    execute: handleSubmit,
  } = useAsyncCallback(
    async (formData: { code: string; email: string }) => {
      setResult(null)
      setProgress(0)
      setCurrentStep(0)\
      setEstimatedTime(15) // Estimated 15 seconds

      const cacheKey = `redeem-${formData.code}-${formData.email}`
      const cachedResult = getCachedData(cacheKey)
      if (cachedResult && Date.now() - cachedResult.timestamp < 60000) { // 1 minute cache
        setResult(cachedResult.data)
        if (cachedResult.data.success) {
          setShowResend(true)
          success("兑换成功！", "邀请邮件已发送到您的邮箱，请查收并点击邀请链接加入团队")
        }
        return cachedResult.data
      }

      // Reset steps
      setSteps(redeemSteps.map((step) => ({ ...step, status: "pending" })))

      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 2, 90))
        setEstimatedTime((prev) => (prev ? Math.max(0, prev - 1) : 0))
      }, 200)

      const stepInterval = setInterval(() => {
        setCurrentStep((prev) => {
          const nextStep = Math.min(prev + 1, steps.length - 1)
          setSteps((current) =>
            current.map((step, index) => ({
              ...step,
              status: index < nextStep ? "completed" : index === nextStep ? "active" : "pending",
            })),
          )
          return nextStep
        })
      }, 3000)

      try {
        info("开始处理兑换请求", "预计需要10-15秒，请耐心等待")

        const response = await fetch("/api/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        })

        clearInterval(progressInterval)
        clearInterval(stepInterval)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || `HTTP ${response.status}`)
        }

        const data: RedeemResponse = await response.json()
        setProgress(100)
        setCurrentStep(steps.length - 1)

        // Mark all steps as completed
        setSteps((current) => current.map((step) => ({ ...step, status: "completed" })))

        setCachedData(cacheKey, data)

        setTimeout(() => {
          setResult(data)
          if (data.success && data.team_id) {
            setShowResend(true)
            success("兑换成功！", "邀请邮件已发送到您的邮箱，请查收并点击邀请链接加入团队")
          } else if (!data.success) {
            // Mark last step as error
            setSteps((current) =>
              current.map((step, index) => ({
                ...step,
                status: index === current.length - 1 ? "error" : step.status,
              })),
            )
            showError("兑换失败", data.message)
          }
        }, 500)

        return data
      } catch (err) {
        clearInterval(progressInterval)
        clearInterval(stepInterval)
        setProgress(0)
        setCurrentStep(0)
        // Mark current step as error
        setSteps((current) =>
          current.map((step, index) => ({
            ...step,
            status: index === currentStep ? "error" : index < currentStep ? "completed" : "pending",
          })),
        )
        throw err
      }
    },
    {
      onError: (error) => {
        console.error("[v0] Redeem error:", error)
        setResult({ success: false, message: error.message || "网络错误，请稍后重试" })
      },
    },
  )

  const {
    loading: resending,
    error: resendError,
    execute: handleResend,
  } = useAsyncCallback(
    async () => {
      if (!result?.team_id || !email.trim()) {
        throw new Error("缺少必要信息")
      }

      info("正在重发邀请", "请稍候...")

      const response = await fetch("/api/redeem/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), team_id: result.team_id }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setResult({ success: data.success, message: data.message, team_id: result.team_id })
      if (data.success) {
        success("重发成功！", "邀请邮件已重新发送，请检查您的邮箱（包括垃圾邮件文件夹）")
      }

      return data
    },
    {
      onError: (error) => {
        console.error("[v0] Resend error:", error)
        showError("重发失败", error.message)
      },
    },
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !email.trim() || hasErrors) return

    await handleSubmit({ code: code.trim(), email: email.trim() })
  }

  useEffect(() => {
    // Auto-format code input
    if (code && !isCodeFocused) {
      const formatted = code.toUpperCase().replace(/[^A-Z0-9-]/g, "")
      if (formatted !== code) {
        setCode(formatted)
      }
    }
  }, [code, isCodeFocused])

  useEffect(() => {
    const hasVisited = localStorage.getItem("gpt-invite-visited")
    if (!hasVisited) {
      setShowTooltip(true)
      localStorage.setItem("gpt-invite-visited", "true")
      setTimeout(() => setShowTooltip(false), 8000)
    }
  }, [])

  const { isTouch } = useMobileGestures()

  return (
    <LoadingOverlay loading={submitting} text="处理中...">
      {process.env.NODE_ENV === 'development' && performanceMetrics && (
        <div className="mb-4 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
          FPS: {performanceMetrics.fps} | Memory: {performanceMetrics.memory}MB | 
          Render Time: {performanceMetrics.renderTime}ms
        </div>
      )}
      
      <Card
        className={`border-border/40 bg-card/50 backdrop-blur-sm animate-fade-in transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 ${
          isTouch ? "hover:scale-100" : "hover:scale-[1.02]"
        }`}
      >
        <CardHeader className="text-center relative px-4 sm:px-6">
          {showTooltip && (
            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 -translate-y-full z-10 animate-fade-in">
              <div className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm shadow-lg max-w-xs">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <span className="text-balance">输入您的兑换码和邮箱即可开始</span>
                </div>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-primary"></div>
              </div>
            </div>
          )}

          <div className="mb-4">
            <LazyImage
              src="/gpt-team-logo.jpg"
              alt="GPT Team Logo"
              width={64}
              height={64}
              className="mx-auto rounded-lg shadow-lg"
              placeholder="/gpt-team-logo.jpg"
            />
          </div>

          <CardTitle className="text-xl sm:text-2xl bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent text-balance">
            兑换席位
          </CardTitle>
          <CardDescription className="text-sm sm:text-base text-pretty">
            请输入您的兑换码和邮箱地址，我们将自动为您分配最优的团队席位
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
          <form onSubmit={onSubmit} className="space-y-4 sm:space-y-6" noValidate>
            <div className="space-y-2 sm:space-y-3">
              <Label htmlFor="code" className="text-sm font-medium flex items-center space-x-2">
                <Key className="w-4 h-4" />
                <span>兑换码</span>
              </Label>
              <div className="relative group">
                <Input
                  id="code"
                  type="text"
                  placeholder="请输入您的兑换码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onFocus={() => setIsCodeFocused(true)}
                  onBlur={() => setIsCodeFocused(false)}
                  className={`pl-10 pr-10 bg-background/50 border-border/60 transition-all duration-200 text-base sm:text-sm ${
                    isTouch ? "min-h-[44px]" : "h-10"
                  } ${isCodeFocused ? "border-primary/50 shadow-lg shadow-primary/10" : ""} ${
                    code && formErrors.some((e) => e.field === "code" && e.severity === "error")
                      ? "border-red-500/50 bg-red-500/5"
                      : code && formErrors.some((e) => e.field === "code" && e.severity === "warning")
                        ? "border-yellow-500/50 bg-yellow-500/5"
                        : code && !formErrors.some((e) => e.field === "code")
                          ? "border-green-500/50 bg-green-500/5"
                          : ""
                  }`}
                  disabled={submitting}
                  required
                  maxLength={32}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  inputMode="text"
                  aria-describedby={formErrors.length > 0 ? "form-errors" : undefined}
                  aria-invalid={hasErrors ? "true" : "false"}
                />
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 transition-colors duration-200 group-focus-within:text-primary" />

                {code && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    {formErrors.some((e) => e.field === "code" && e.severity === "error") ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : formErrors.some((e) => e.field === "code" && e.severity === "warning") ? (
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <Label htmlFor="email" className="text-sm font-medium flex items-center space-x-2">
                <Mail className="w-4 h-4" />
                <span>邮箱地址</span>
              </Label>
              <div className="relative group">
                <Input
                  id="email"
                  type="email"
                  placeholder="请输入您的邮箱地址"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setIsEmailFocused(true)}
                  onBlur={() => setIsEmailFocused(false)}
                  className={`pl-10 pr-10 bg-background/50 border-border/60 transition-all duration-200 text-base sm:text-sm ${
                    isTouch ? "min-h-[44px]" : "h-10"
                  } ${isEmailFocused ? "border-primary/50 shadow-lg shadow-primary/10" : ""} ${
                    email && formErrors.some((e) => e.field === "email" && e.severity === "error")
                      ? "border-red-500/50 bg-red-500/5"
                      : email && formErrors.some((e) => e.field === "email" && e.severity === "warning")
                        ? "border-yellow-500/50 bg-yellow-500/5"
                        : email && !formErrors.some((e) => e.field === "email")
                          ? "border-green-500/50 bg-green-500/5"
                          : ""
                  }`}
                  disabled={submitting}
                  required
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  inputMode="email"
                  aria-describedby={formErrors.length > 0 ? "form-errors" : undefined}
                  aria-invalid={hasErrors ? "true" : "false"}
                />
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 transition-colors duration-200 group-focus-within:text-primary" />

                {email && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    {formErrors.some((e) => e.field === "email" && e.severity === "error") ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : formErrors.some((e) => e.field === "email" && e.severity === "warning") ? (
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {(hasErrors || hasWarnings) && code.trim() && email.trim() && (
              <Alert
                className={`${hasErrors ? "border-red-500/50 bg-red-500/10" : "border-yellow-500/50 bg-yellow-500/10"} animate-fade-in`}
                id="form-errors"
                role="alert"
              >
                <AlertCircle className={`w-4 h-4 ${hasErrors ? "text-red-600" : "text-yellow-600"} flex-shrink-0`} />
                <AlertDescription className={`${hasErrors ? "text-red-600" : "text-yellow-600"} text-sm`}>
                  <div className="space-y-1">
                    {formErrors.map((error, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <span className="w-1 h-1 bg-current rounded-full mt-2 flex-shrink-0"></span>
                        <span className="text-pretty">{error.message}</span>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {submitting && (
              <div className="space-y-3 sm:space-y-4 animate-fade-in" role="status" aria-live="polite">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center space-x-2">
                    <Clock className="w-4 h-4" />
                    <span>处理进度</span>
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-primary font-medium">{progress}%</span>
                    {estimatedTime && estimatedTime > 0 && (
                      <span className="text-xs text-muted-foreground">预计剩余 {estimatedTime}s</span>
                    )}
                  </div>
                </div>
                <Progress value={progress} className="h-2" aria-label={`处理进度 ${progress}%`} />

                <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 bg-background/30 rounded-lg border border-border/40">
                  {steps.map((step, index) => (
                    <div
                      key={step.id}
                      className={`flex items-center space-x-3 transition-all duration-300 ${
                        step.status === "active" && !isTouch ? "scale-105" : ""
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 transition-all duration-300 flex-shrink-0 ${
                          step.status === "completed"
                            ? "bg-green-500 border-green-500 text-white"
                            : step.status === "active"
                              ? "bg-primary border-primary text-white animate-pulse"
                              : step.status === "error"
                                ? "bg-red-500 border-red-500 text-white"
                                : "bg-background border-border text-muted-foreground"
                        }`}
                      >
                        {step.status === "completed" ? (
                          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                        ) : step.status === "active" ? (
                          <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                        ) : step.status === "error" ? (
                          <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                        ) : (
                          <div className="w-3 h-3 sm:w-4 sm:h-4">{step.icon}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm font-medium transition-colors duration-300 text-balance ${
                            step.status === "active"
                              ? "text-primary"
                              : step.status === "completed"
                                ? "text-green-600"
                                : step.status === "error"
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                          }`}
                        >
                          {step.title}
                        </div>
                        <div className="text-xs text-muted-foreground text-pretty">{step.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              type="submit"
              className={`w-full bg-gradient-to-r from-primary to-brand-secondary text-primary-foreground hover:from-primary/90 hover:to-brand-secondary/90 transition-all duration-300 transform disabled:transform-none disabled:hover:scale-100 ${
                isTouch
                  ? "min-h-[48px] text-base hover:scale-100 active:scale-95"
                  : "hover:scale-[1.02] hover:shadow-lg"
              }`}
              disabled={submitting || hasErrors}
              aria-describedby={submitting ? "submit-status" : undefined}
            >
              {submitting ? (
                <div className="flex items-center justify-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span id="submit-status">处理中...</span>
                  {estimatedTime && estimatedTime > 0 && <span className="text-xs opacity-75">({estimatedTime}s)</span>}
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <Zap className="w-4 h-4" />
                  <span>立即兑换席位</span>
                </div>
              )}
            </Button>
          </form>

          <RetryWrapper
            error={submitError}
            onRetry={() => handleSubmit({ code: code.trim(), email: email.trim() })}
            maxRetries={3}
          >
            {result && (
              <Alert
                className={`animate-fade-in transition-all duration-500 transform ${
                  isTouch ? "hover:scale-100" : "hover:scale-[1.01]"
                } ${
                  result.success
                    ? "border-green-500/50 bg-green-500/10 shadow-lg shadow-green-500/10"
                    : "border-red-500/50 bg-red-500/10 shadow-lg shadow-red-500/10"
                }`}
                role="alert"
                aria-live="polite"
              >
                <div className="flex items-start space-x-3">
                  {result.success ? (
                    <CheckCircle
                      className="w-5 h-5 text-green-600 mt-0.5 animate-pulse flex-shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  )}
                  <div className="flex-1 min-w-0">
                    <AlertDescription className="text-sm font-medium text-pretty">{result.message}</AlertDescription>
                    {result.success && (
                      <div className="mt-2 text-xs text-muted-foreground text-pretty">
                        请检查您的邮箱（包括垃圾邮件文件夹），点击邀请链接完成加入流程
                      </div>
                    )}
                  </div>
                </div>
              </Alert>
            )}
          </RetryWrapper>

          {showResend && result?.success && (
            <div className="text-center animate-fade-in space-y-3 sm:space-y-4">
              <div className="p-3 sm:p-4 bg-background/30 rounded-lg border border-border/40">
                <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground mb-3">
                  <Mail className="w-4 h-4" />
                  <span>没有收到邀请邮件？</span>
                </div>
                <div className="text-xs text-muted-foreground mb-4 space-y-1 text-left">
                  <div>• 请检查垃圾邮件文件夹</div>
                  <div>• 邮件可能需要几分钟才能送达</div>
                  <div>• 确认邮箱地址是否正确</div>
                </div>
                <RetryWrapper error={resendError} onRetry={handleResend} maxRetries={2}>
                  <Button
                    variant="outline"
                    size={isTouch ? "default" : "sm"}
                    onClick={handleResend}
                    disabled={resending}
                    className={`border-border/60 hover:bg-accent/50 bg-transparent transition-all duration-200 ${
                      isTouch ? "min-h-[44px] hover:scale-100 active:scale-95" : "hover:scale-105"
                    }`}
                    aria-describedby={resending ? "resend-status" : undefined}
                  >
                    {resending ? (
                      <div className="flex items-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span id="resend-status">重发中...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <RefreshCw className="w-4 h-4" />
                        <span>重新发送邀请</span>
                      </div>
                    )}
                  </Button>
                </RetryWrapper>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </LoadingOverlay>
  )
}
