"use client"

import type React from "react"
import { memo, useMemo } from "react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, AlertCircle, Loader2, Mail, Info, Clock, Shield, Zap } from "lucide-react"
import { useToast } from "@/components/toast-provider"
import { useAsyncCallback } from "@/hooks/use-async"
import { LoadingOverlay } from "@/components/loading-spinner"
import { useMobileGestures } from "@/hooks/use-mobile-gestures"
import { useDebouncedValue, useDebouncedCallback } from "@/hooks/use-debounced-value"
import { useCache } from "@/hooks/use-cache"
import { usePerformanceMonitor } from "@/hooks/use-performance-monitor"

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

const RedeemStepComponent = memo(({ step, isActive }: { step: RedeemStep; isActive: boolean }) => {
  const { isTouch } = useMobileGestures()

  return (
    <div
      className={`flex items-center space-x-3 transition-all duration-300 ${isActive && !isTouch ? "scale-105" : ""}`}
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
  )
})

RedeemStepComponent.displayName = "RedeemStepComponent"

export default function OptimizedRedeemForm() {
  const [code, setCode] = useState("")
  const [email, setEmail] = useState("")
  const [result, setResult] = useState<RedeemResponse | null>(null)
  const [showResend, setShowResend] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [isCodeFocused, setIsCodeFocused] = useState(false)
  const [isEmailFocused, setIsEmailFocused] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null)

  const { success, error: showError, info } = useToast()
  const { isTouch } = useMobileGestures()
  const cache = useCache<RedeemResponse>({ ttl: 5 * 60 * 1000 }) // 5 minute cache

  const { metrics } = usePerformanceMonitor("RedeemForm", {
    trackMemory: true,
    sampleRate: 0.1,
  })

  const debouncedCode = useDebouncedValue(code, 300)
  const debouncedEmail = useDebouncedValue(email, 300)

  const redeemSteps: RedeemStep[] = useMemo(
    () => [
      {
        id: "validate",
        title: "验证兑换码",
        description: "检查兑换码有效性和可用性",
        status: "pending",
        icon: <Shield className="w-4 h-4" />,
      },
      {
        id: "allocate",
        title: "分配席位",
        description: "智能选择最优母账号并分配席位",
        status: "pending",
        icon: <Zap className="w-4 h-4" />,
      },
      {
        id: "invite",
        title: "发送邀请",
        description: "向您的邮箱发送团队邀请链接",
        status: "pending",
        icon: <Mail className="w-4 h-4" />,
      },
      {
        id: "complete",
        title: "完成兑换",
        description: "兑换成功，请查收邮件",
        status: "pending",
        icon: <CheckCircle className="w-4 h-4" />,
      },
    ],
    [],
  )

  const [steps, setSteps] = useState<RedeemStep[]>(redeemSteps)

  const validateForm = useMemo(() => {
    const errors: { field: string; message: string; severity: "error" | "warning" }[] = []

    if (!debouncedCode.trim()) {
      errors.push({ field: "code", message: "请输入兑换码", severity: "error" })
    } else if (debouncedCode.trim().length < 6) {
      errors.push({ field: "code", message: "兑换码长度至少6位", severity: "error" })
    } else if (!/^[A-Za-z0-9-]{6,32}$/.test(debouncedCode.trim())) {
      errors.push({ field: "code", message: "兑换码只能包含字母、数字和连字符", severity: "error" })
    } else if (debouncedCode.trim().length > 20) {
      errors.push({ field: "code", message: "兑换码可能过长，请检查", severity: "warning" })
    }

    if (!debouncedEmail.trim()) {
      errors.push({ field: "email", message: "请输入邮箱地址", severity: "error" })
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(debouncedEmail.trim())) {
      errors.push({ field: "email", message: "邮箱格式不正确", severity: "error" })
    } else if (!debouncedEmail.includes(".")) {
      errors.push({ field: "email", message: "请输入完整的邮箱地址", severity: "warning" })
    }

    return errors
  }, [debouncedCode, debouncedEmail])

  const hasErrors = useMemo(() => validateForm.filter((e) => e.severity === "error").length > 0, [validateForm])

  const hasWarnings = useMemo(() => validateForm.filter((e) => e.severity === "warning").length > 0, [validateForm])

  const {
    loading: submitting,
    error: submitError,
    execute: handleSubmit,
  } = useAsyncCallback(
    async (formData: { code: string; email: string }) => {
      const cacheKey = `redeem-${formData.code}-${formData.email}`
      const cachedResult = cache.get(cacheKey)

      if (cachedResult) {
        setResult(cachedResult)
        if (cachedResult.success && cachedResult.team_id) {
          setShowResend(true)
          success("兑换成功！", "邀请邮件已发送到您的邮箱（来自缓存）")
        }
        return cachedResult
      }

      setResult(null)
      setProgress(0)
      setCurrentStep(0)
      setEstimatedTime(15) // Estimated 15 seconds

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

        cache.set(cacheKey, data)

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

  const debouncedSubmit = useDebouncedCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !email.trim() || hasErrors) return

    await handleSubmit({ code: code.trim(), email: email.trim() })
  }, 300)

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

  return (
    <LoadingOverlay loading={submitting} text="处理中...">
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

          <CardTitle className="text-xl sm:text-2xl bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent text-balance">
            兑换席位
          </CardTitle>
          <CardDescription className="text-sm sm:text-base text-pretty">
            请输入您的兑换码和邮箱地址，我们将自动为您分配最优的团队席位
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
          <form onSubmit={debouncedSubmit} className="space-y-4 sm:space-y-6" noValidate>
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
                    <RedeemStepComponent key={step.id} step={step} isActive={step.status === "active"} />
                  ))}
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </LoadingOverlay>
  )
}
