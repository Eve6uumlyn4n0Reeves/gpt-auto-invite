'use client'

import React, { forwardRef } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface EnhancedCardProps extends React.ComponentProps<'div'> {
  hover?: boolean
  interactive?: boolean
  loading?: boolean
  children: React.ReactNode
}

export const EnhancedCard = forwardRef<HTMLDivElement, EnhancedCardProps>(
  ({ className, hover = true, interactive = false, loading = false, children, ...props }, ref) => {
    return (
      <Card
        ref={ref}
        className={cn(
          'border-border/40 bg-card/50 backdrop-blur-sm',
          'transition-all duration-300 ease-in-out',
          hover && 'hover:shadow-lg hover:scale-[1.02] hover:border-primary/30',
          interactive && 'cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]',
          loading && 'opacity-50 pointer-events-none',
          className
        )}
        {...props}
      >
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-xl z-10">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Card content */}
        <div className={cn(loading && 'opacity-50')}>
          {children}
        </div>
      </Card>
    )
  }
)

EnhancedCard.displayName = 'EnhancedCard'

// Status card variant
export const StatusCard: React.FC<{
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  color?: string
  bgColor?: string
}> = ({ title, value, subtitle, icon, color = 'text-primary', bgColor = 'bg-primary/10' }) => (
  <EnhancedCard hover className="group">
    <div className="p-3 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">
            {title}
          </p>
          <p className={`text-lg sm:text-2xl font-bold ${color} mb-1`}>
            {value.toLocaleString()}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
        <div className={`w-8 h-8 sm:w-12 sm:h-12 ${bgColor} rounded-lg flex items-center justify-center flex-shrink-0 ml-2 group-hover:scale-110 transition-transform`}>
          <span className={`${color} text-sm sm:text-base`}>
            {icon}
          </span>
        </div>
      </div>
    </div>
  </EnhancedCard>
)
