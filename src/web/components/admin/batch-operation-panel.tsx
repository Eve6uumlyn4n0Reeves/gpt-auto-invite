'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'

export interface BatchItem {
  id: number | string
  label: string
  subtitle?: string
  warning?: boolean
}

export interface BatchOperationPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  action: string
  items: BatchItem[]
  isDangerous?: boolean
  onConfirm: () => void | Promise<void>
  loading?: boolean
}

export function BatchOperationPanel({
  open,
  onOpenChange,
  title,
  description,
  action,
  items,
  isDangerous = false,
  onConfirm,
  loading = false,
}: BatchOperationPanelProps) {
  const [confirmed, setConfirmed] = React.useState(false)

  // 重置确认状态当对话框关闭时
  React.useEffect(() => {
    if (!open) {
      setConfirmed(false)
    }
  }, [open])

  const handleConfirm = async () => {
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      // 错误处理由调用方负责
    }
  }

  const warningCount = items.filter((item) => item.warning).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDangerous && <AlertTriangle className="h-5 w-5 text-error" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          {/* 操作摘要 */}
          <div className={`rounded-lg border p-4 ${isDangerous ? 'border-error/50 bg-error/5' : 'border-border/40 bg-muted/30'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  即将 {action} <span className="text-primary">{items.length}</span> 项
                </div>
                {warningCount > 0 && (
                  <div className="text-sm text-warning mt-1">
                    包含 {warningCount} 个警告项，请仔细检查
                  </div>
                )}
              </div>
              <Badge variant={isDangerous ? 'destructive' : 'default'}>
                {action}
              </Badge>
            </div>
          </div>

          {/* 受影响项目列表 */}
          <div>
            <div className="text-sm font-medium mb-2">受影响的项目:</div>
            <ScrollArea className="h-[300px] rounded-md border">
              <div className="p-3 space-y-2">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 rounded-md border p-3 ${item.warning ? 'border-warning/50 bg-warning/5' : 'border-border/40'}`}
                  >
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-medium shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.label}</div>
                      {item.subtitle && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      )}
                      {item.warning && (
                        <div className="flex items-center gap-1 text-xs text-warning mt-1">
                          <AlertTriangle className="h-3 w-3" />
                          <span>需要注意</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* 危险操作二次确认 */}
          {isDangerous && (
            <div className="flex items-center space-x-2 rounded-lg border border-error/50 bg-error/5 p-4">
              <Checkbox
                id="confirm-dangerous"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <label
                htmlFor="confirm-dangerous"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                我确认要执行此危险操作，并了解其后果
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || (isDangerous && !confirmed)}
            variant={isDangerous ? 'destructive' : 'default'}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                执行中...
              </>
            ) : (
              <>确认{action}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

