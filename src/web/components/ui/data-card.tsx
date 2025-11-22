'use client'

import * as React from 'react'
import { type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface DataCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  value: string | number
  icon?: LucideIcon
  trend?: {
    value: number
    label: string
    positive?: boolean
  }
  footer?: React.ReactNode
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
}

export function DataCard({
  title,
  description,
  value,
  icon: Icon,
  trend,
  footer,
  variant = 'default',
  className,
  ...props
}: DataCardProps) {
  const variantClasses = {
    default: 'border-border/40 bg-card/50',
    primary: 'border-primary/30 bg-primary/5',
    success: 'border-success/30 bg-success/5',
    warning: 'border-warning/30 bg-warning/5',
    error: 'border-error/30 bg-error/5',
  }

  const valueColorClasses = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
  }

  return (
    <Card className={cn(variantClasses[variant], 'backdrop-blur-sm', className)} {...props}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {Icon && (
          <div
            className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center',
              variant === 'default' && 'bg-muted/50',
              variant === 'primary' && 'bg-primary/10',
              variant === 'success' && 'bg-success/10',
              variant === 'warning' && 'bg-warning/10',
              variant === 'error' && 'bg-error/10',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4',
                variant === 'default' && 'text-muted-foreground',
                variant === 'primary' && 'text-primary',
                variant === 'success' && 'text-success',
                variant === 'warning' && 'text-warning',
                variant === 'error' && 'text-error',
              )}
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className={cn('text-2xl font-bold', valueColorClasses[variant])}>{value}</div>
          
          {trend && (
            <div className="flex items-center gap-1 text-xs">
              <span className={cn(trend.positive ? 'text-success' : 'text-error')}>
                {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          )}

          {footer && <div className="pt-2 border-t border-border/40">{footer}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

