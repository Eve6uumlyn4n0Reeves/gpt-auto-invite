'use client'

import * as React from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ActionButtonProps extends ButtonProps {
  icon?: LucideIcon
  loading?: boolean
  loadingText?: string
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ icon: Icon, loading, loadingText, children, className, disabled, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn('gap-2', className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingText || children}
          </>
        ) : (
          <>
            {Icon && <Icon className="h-4 w-4" />}
            {children}
          </>
        )}
      </Button>
    )
  },
)

ActionButton.displayName = 'ActionButton'

