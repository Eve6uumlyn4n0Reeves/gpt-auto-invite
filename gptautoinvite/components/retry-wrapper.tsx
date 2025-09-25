"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RefreshCw, AlertCircle } from "lucide-react"

interface RetryWrapperProps {
  children: React.ReactNode
  onRetry: () => Promise<void> | void
  error?: Error | string | null
  loading?: boolean
  maxRetries?: number
  retryDelay?: number
}

export function RetryWrapper({
  children,
  onRetry,
  error,
  loading = false,
  maxRetries = 3,
  retryDelay = 1000,
}: RetryWrapperProps) {
  const [retryCount, setRetryCount] = useState(0)
  const [retrying, setRetrying] = useState(false)

  const handleRetry = useCallback(async () => {
    if (retryCount >= maxRetries) return

    setRetrying(true)
    setRetryCount((prev) => prev + 1)

    try {
      // 添加延迟
      if (retryDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }

      await onRetry()
    } catch (retryError) {
      console.error("[v0] Retry failed:", retryError)
    } finally {
      setRetrying(false)
    }
  }, [onRetry, retryCount, maxRetries, retryDelay])

  const resetRetries = useCallback(() => {
    setRetryCount(0)
  }, [])

  if (error && !loading) {
    const errorMessage = typeof error === "string" ? error : error.message

    return (
      <div className="space-y-4">
        <Alert className="border-red-500/50 bg-red-500/10" role="alert">
          <AlertCircle className="w-4 h-4 text-red-600" aria-hidden="true" />
          <AlertDescription className="text-red-600">
            {errorMessage}
            {retryCount > 0 && <span className="block text-sm mt-1 opacity-75">已重试 {retryCount} 次</span>}
          </AlertDescription>
        </Alert>

        <div className="flex space-x-2">
          <Button
            onClick={handleRetry}
            disabled={retrying || retryCount >= maxRetries}
            variant="outline"
            size="sm"
            aria-describedby={retrying ? "retry-status" : undefined}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? "animate-spin" : ""}`} aria-hidden="true" />
            {retrying ? <span id="retry-status">重试中...</span> : `重试 (${retryCount}/${maxRetries})`}
          </Button>

          {retryCount > 0 && (
            <Button onClick={resetRetries} variant="ghost" size="sm">
              重置
            </Button>
          )}
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function withRetry<P extends object>(
  Component: React.ComponentType<P>,
  retryOptions?: Partial<RetryWrapperProps>,
) {
  return function WrappedComponent(props: P & { onRetry?: () => Promise<void> | void; error?: Error | string | null }) {
    const { onRetry, error, ...componentProps } = props

    return (
      <RetryWrapper onRetry={onRetry || (() => window.location.reload())} error={error} {...retryOptions}>
        <Component {...(componentProps as P)} />
      </RetryWrapper>
    )
  }
}
