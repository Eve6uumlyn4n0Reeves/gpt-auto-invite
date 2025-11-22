'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      status: {
        success: 'border-success/30 bg-success/10 text-success',
        error: 'border-error/30 bg-error/10 text-error',
        warning: 'border-warning/30 bg-warning/10 text-warning',
        info: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
        pending: 'border-warning/30 bg-warning/10 text-warning',
        running: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
        succeeded: 'border-success/30 bg-success/10 text-success',
        failed: 'border-error/30 bg-error/10 text-error',
        cancelled: 'border-muted/40 bg-muted/20 text-muted-foreground',
        expired: 'border-warning/30 bg-warning/10 text-warning',
        active: 'border-success/30 bg-success/10 text-success',
        inactive: 'border-muted/40 bg-muted/20 text-muted-foreground',
        disabled: 'border-muted/40 bg-muted/20 text-muted-foreground line-through',
        sent: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
        accepted: 'border-success/30 bg-success/10 text-success',
        unused: 'border-success/30 bg-success/10 text-success',
        used: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
        blocked: 'border-error/30 bg-error/10 text-error',
        invalid: 'border-error/30 bg-error/10 text-error',
      },
    },
    defaultVariants: {
      status: 'info',
    },
  },
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusBadgeVariants> {
  showIcon?: boolean
  animated?: boolean
}

const statusIcons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: AlertCircle,
  pending: Clock,
  running: Loader2,
  succeeded: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
  expired: AlertCircle,
  active: CheckCircle2,
  inactive: XCircle,
  disabled: Ban,
  sent: CheckCircle2,
  accepted: CheckCircle2,
  unused: Clock,
  used: CheckCircle2,
  blocked: Ban,
  invalid: XCircle,
}

export function StatusBadge({
  status,
  showIcon = true,
  animated = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const Icon = status ? statusIcons[status] : null

  return (
    <div className={cn(statusBadgeVariants({ status }), className)} {...props}>
      {showIcon && Icon && (
        <Icon
          className={cn(
            'h-3 w-3',
            animated && (status === 'running' || status === 'pending') && 'animate-spin',
          )}
        />
      )}
      <span>{children}</span>
    </div>
  )
}

