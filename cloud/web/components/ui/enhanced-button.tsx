'use client'

import React, { forwardRef } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

type BaseButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

interface EnhancedButtonProps extends BaseButtonProps {
  loading?: boolean
  icon?: React.ReactNode
  tooltip?: string
}

export const EnhancedButton = forwardRef<HTMLButtonElement, EnhancedButtonProps>(
  ({ children, loading, icon, tooltip, className, disabled, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'relative overflow-hidden transition-all duration-200',
          'hover:scale-[1.02] active:scale-[0.98]',
          'focus:ring-2 focus:ring-primary/20',
          loading && 'cursor-not-allowed',
          className
        )}
        {...props}
      >
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Button content */}
        <div className={cn('flex items-center gap-2', loading && 'opacity-0')}>
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span>{children}</span>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-muted text-muted-foreground text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {tooltip}
          </div>
        )}
      </Button>
    )
  }
)

EnhancedButton.displayName = 'EnhancedButton'
