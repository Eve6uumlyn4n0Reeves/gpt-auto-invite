"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ToastProps {
  title?: string
  description?: string
  variant?: "default" | "success" | "error" | "warning"
  onClose?: () => void
  children?: React.ReactNode
}

export type ToastActionElement = React.ReactElement<any, string | React.JSXElementConstructor<any>>

export function Toast({ title, description, variant = "default", onClose, children }: ToastProps) {
  const [isVisible, setIsVisible] = React.useState(true)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      onClose?.()
    }, 5000)

    return () => clearTimeout(timer)
  }, [onClose])

  if (!isVisible) return null

  const variantStyles = {
    default: "bg-card border-border",
    success: "bg-success/10 border-success/30 text-success",
    error: "bg-error/10 border-error/30 text-error",
    warning: "bg-warning/10 border-warning/30 text-warning",
  }

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50 w-full max-w-sm rounded-lg border p-4 shadow-lg animate-slide-in",
        variantStyles[variant],
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {title && <div className="font-medium text-sm mb-1">{title}</div>}
          {description && <div className="text-sm opacity-90">{description}</div>}
          {children}
        </div>
        <button
          onClick={() => {
            setIsVisible(false)
            onClose?.()
          }}
          className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function ToastClose({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100",
        className
      )}
      {...props}
    >
      <X className="h-4 w-4" />
    </button>
  )
}

export function ToastDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-sm opacity-90", className)} {...props} />
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function ToastTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("font-medium text-sm", className)} {...props} />
}

export function ToastViewport({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      className={cn(
        "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
        className
      )}
      {...props}
    />
  )
}
