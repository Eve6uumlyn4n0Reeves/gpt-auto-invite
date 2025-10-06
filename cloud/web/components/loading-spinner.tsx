"use client"

import type React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg"
  text?: string
  className?: string
  fullScreen?: boolean
}

export function LoadingSpinner({ size = "md", text, className, fullScreen = false }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  }

  const content = (
    <div className={cn("flex flex-col items-center justify-center space-y-2", className)}>
      <Loader2 className={cn("animate-spin text-primary", sizeClasses[size])} aria-hidden="true" />
      {text && (
        <p className="text-sm text-muted-foreground animate-pulse" role="status" aria-live="polite">
          {text}
        </p>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
        role="dialog"
        aria-modal="true"
        aria-label="加载中"
      >
        {content}
      </div>
    )
  }

  return content
}

export function LoadingOverlay({
  children,
  loading,
  text,
}: {
  children: React.ReactNode
  loading: boolean
  text?: string
}) {
  return (
    <div className="relative">
      {children}
      {loading && (
        <div
          className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg"
          role="status"
          aria-live="polite"
          aria-label={text || "加载中"}
        >
          <LoadingSpinner text={text} />
        </div>
      )}
    </div>
  )
}

export function SkeletonLoader({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-muted rounded", className)} />
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, j) => (
            <SkeletonLoader key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
