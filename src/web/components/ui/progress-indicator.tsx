'use client'

import * as React from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface ProgressIndicatorProps {
  current: number
  total: number
  showPercentage?: boolean
  showCounts?: boolean
  variant?: 'default' | 'success' | 'warning' | 'error'
  className?: string
}

export function ProgressIndicator({
  current,
  total,
  showPercentage = true,
  showCounts = true,
  variant = 'default',
  className,
}: ProgressIndicatorProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  const getVariantClasses = () => {
    switch (variant) {
      case 'success':
        return 'text-success'
      case 'warning':
        return 'text-warning'
      case 'error':
        return 'text-error'
      default:
        return 'text-primary'
    }
  }

  const getProgressColor = () => {
    switch (variant) {
      case 'success':
        return '[&>div]:bg-success'
      case 'warning':
        return '[&>div]:bg-warning'
      case 'error':
        return '[&>div]:bg-error'
      default:
        return ''
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      {(showPercentage || showCounts) && (
        <div className="flex items-center justify-between text-sm">
          {showPercentage && (
            <span className={cn('font-medium', getVariantClasses())}>{percentage}%</span>
          )}
          {showCounts && (
            <span className="text-muted-foreground">
              {current} / {total}
            </span>
          )}
        </div>
      )}
      <Progress value={percentage} className={cn('h-2', getProgressColor())} />
    </div>
  )
}

