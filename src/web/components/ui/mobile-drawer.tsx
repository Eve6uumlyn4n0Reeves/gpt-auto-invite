'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface MobileDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function MobileDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: MobileDrawerProps) {
  // 防止背景滚动
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-50 bg-black/50 animate-fade-in md:hidden"
        onClick={() => onOpenChange(false)}
      />

      {/* 抽屉内容 */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-xl animate-slide-up md:hidden',
          'max-h-[90vh] overflow-hidden flex flex-col',
          className,
        )}
      >
        {/* 手柄 */}
        <div className="flex justify-center pt-4 pb-2">
          <div className="w-12 h-1 rounded-full bg-muted" />
        </div>

        {/* 头部 */}
        {(title || description) && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between">
              {title && <div className="text-lg font-semibold">{title}</div>}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {description && <div className="text-sm text-muted-foreground mt-1">{description}</div>}
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">{children}</div>
      </div>
    </>
  )
}

