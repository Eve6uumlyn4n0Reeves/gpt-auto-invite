"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, AlertCircle, Loader2, Mail, Key, RefreshCw } from "lucide-react"
import { useToast } from "@/components/toast-provider"
import { useAsyncCallback } from "@/hooks/use-async"
import { RetryWrapper } from "@/components/retry-wrapper"
import { LoadingOverlay } from "@/components/loading-spinner"

interface RedeemResponse {
  success: boolean
  message: string
  invite_request_id?: number
  mother_id?: number
  team_id?: string
}

export default function RedeemForm() {
  const [code, setCode] = useState("")
  const [email, setEmail] = useState("")
  const [result, setResult] = useState<RedeemResponse | null>(null)
  const [showResend, setShowResend] = useState(false)
  const [progress, setProgress] = useState(0)
  const { success, error: showError } = useToast()

  const { loading: submitting, error: submitError, execute: handleSubmit } = useAsyncCallback(
    async (formData: { code: string; email: string }) => {
      setResult(null)
      setProgress(0)

      // 妯℃嫙杩涘害
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90))
      }, 100)

      try {
        const response = await fetch("/api/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || `HTTP ${response.status}`)
        }

        const data: RedeemResponse = await response.json()
        setProgress(100)

        setTimeout(() => {
          setResult(data)
          if (data.success && data.team_id) {
            setShowResend(true)
            success("鍏戞崲鎴愬姛", "閭€璇烽偖浠跺凡鍙戦€佸埌鎮ㄧ殑閭")
          } else if (!data.success) {
            showError("鍏戞崲澶辫触", data.message)
          }
          clearInterval(progressInterval)
        }, 500)

        return data
      } catch (err) {
        clearInterval(progressInterval)
        setProgress(0)
        throw err
      }
    },
    {
      onError: (error) => {
        console.error("[v0] Redeem error:", error)
        setResult({ success: false, message: error.message || "缃戠粶閿欒锛岃绋嶅悗閲嶈瘯" })
      },
    },
  )

  const { loading: resending, error: resendError, execute: handleResend } = useAsyncCallback(
    async () => {
      if (!result?.team_id || !email.trim()) {
        throw new Error("缂哄皯蹇呰淇℃伅")
      }

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
        success("閲嶅彂鎴愬姛", "閭€璇烽偖浠跺凡閲嶆柊鍙戦€?)
      }

      return data
    },
    {
      onError: (error) => {
        console.error("[v0] Resend error:", error)
        showError("閲嶅彂澶辫触", error.message)
      },
    },
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !email.trim()) return

    await handleSubmit({ code: code.trim(), email: email.trim() })
  }

  const validateForm = () => {
    const errors: string[] = []
    if (!code.trim()) {
      errors.push("璇疯緭鍏ュ厬鎹㈢爜")
    } else if (!/^[A-Za-z0-9-]{6,32}$/.test(code.trim())) {
      errors.push("鍏戞崲鐮佹牸寮忔棤鏁?)
    }
    if (!email.trim()) {
      errors.push("璇疯緭鍏ラ偖绠卞湴鍧€")
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.push("閭鏍煎紡鏃犳晥")
    }
    return errors
  }

  const formErrors = validateForm()
  const isFormValid = formErrors.length === 0

  return (
    <LoadingOverlay loading={submitting} text="澶勭悊涓?..">
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm animate-fade-in transition-all duration-200 hover:scale-105 hover:shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">鍏戞崲甯綅</CardTitle>
          <CardDescription>璇疯緭鍏ユ偍鐨勫厬鎹㈢爜鍜岄偖绠卞湴鍧€</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="code" className="text-sm font-medium">
                鍏戞崲鐮?              </Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="code"
                  type="text"
                  placeholder="璇疯緭鍏ユ偍鐨勫厬鎹㈢爜"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="pl-10 bg-background/50 border-border/60 focus:border-primary/50 focus-ring"
                  disabled={submitting}
                  required
                  aria-describedby={formErrors.length > 0 ? "form-errors" : undefined}
                  aria-invalid={!isFormValid && code.trim() ? "true" : "false"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                閭鍦板潃
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="email"
                  type="email"
                  placeholder="璇疯緭鍏ユ偍鐨勯偖绠卞湴鍧€"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-background/50 border-border/60 focus:border-primary/50 focus-ring"
                  disabled={submitting}
                  required
                  aria-describedby={formErrors.length > 0 ? "form-errors" : undefined}
                  aria-invalid={!isFormValid && email.trim() ? "true" : "false"}
                />
              </div>
            </div>

            {!isFormValid && code.trim() && email.trim() && (
              <Alert className="border-yellow-500/50 bg-yellow-500/10" id="form-errors" role="alert">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <AlertDescription className="text-yellow-600">
                  <ul className="list-disc list-inside space-y-1">
                    {formErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {submitting && progress > 0 && (
              <div className="space-y-2" role="status" aria-live="polite">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">澶勭悊杩涘害</span>
                  <span className="text-primary">{progress}%</span>
                </div>
                <Progress value={progress} showLabel={false} aria-label={`澶勭悊杩涘害 ${progress}%`} />
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200"
              disabled={submitting || !isFormValid}
              aria-describedby={submitting ? "submit-status" : undefined}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span id="submit-status">澶勭悊涓?..</span>
                </>
              ) : (
                "鍏戞崲甯綅"
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
                className={`animate-fade-in transition-all duration-300 ${
                  result.success
                    ? "border-success/50 bg-success/10 status-active"
                    : "border-error/50 bg-error/10 status-error"
                }`}
                role="alert"
                aria-live="polite"
              >
                <div className="flex items-start space-x-2">
                  {result.success ? (
                    <CheckCircle className="w-4 h-4 text-success mt-0.5" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-error mt-0.5" aria-hidden="true" />
                  )}
                  <AlertDescription className="text-sm">{result.message}</AlertDescription>
                </div>
              </Alert>
            )}
          </RetryWrapper>

          {showResend && result?.success && (
            <div className="text-center animate-fade-in">
              <p className="text-sm text-muted-foreground mb-3">娌℃湁鏀跺埌閭€璇烽偖浠讹紵</p>
              <RetryWrapper error={resendError} onRetry={handleResend} maxRetries={2}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResend}
                  disabled={resending}
                  className="border-border/60 hover:bg-accent/50 bg-transparent transition-all duration-200"
                  aria-describedby={resending ? "resend-status" : undefined}
                >
                  {resending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span id="resend-status">閲嶅彂涓?..</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      閲嶅彂閭€璇?                    </>
                  )}
                </Button>
              </RetryWrapper>
            </div>
          )}
        </CardContent>
      </Card>
    </LoadingOverlay>
  )
}



