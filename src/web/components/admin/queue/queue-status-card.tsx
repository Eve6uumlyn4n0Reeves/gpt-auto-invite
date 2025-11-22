'use client'

import { Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface QueueStatusCardProps {
  requestId?: number
  status: string
  position?: number
  estimatedTime?: string
  message?: string
  compact?: boolean
}

export function QueueStatusCard({
  requestId,
  status,
  position,
  estimatedTime,
  message,
  compact = false,
}: QueueStatusCardProps) {
  const getStatusConfig = (status: string) => {
    const configs = {
      pending: {
        icon: Clock,
        label: '排队中',
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/30',
      },
      running: {
        icon: Loader2,
        label: '执行中',
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        spinning: true,
      },
      succeeded: {
        icon: CheckCircle,
        label: '完成',
        color: 'text-success',
        bgColor: 'bg-success/10',
        borderColor: 'border-success/30',
      },
      failed: {
        icon: XCircle,
        label: '失败',
        color: 'text-error',
        bgColor: 'bg-error/10',
        borderColor: 'border-error/30',
      },
      expired: {
        icon: AlertCircle,
        label: '已过期',
        color: 'text-warning',
        bgColor: 'bg-warning/10',
        borderColor: 'border-warning/30',
      },
    }
    return configs[status as keyof typeof configs] || configs.pending
  }

  const config = getStatusConfig(status)
  const Icon = config.icon

  if (compact) {
    return (
      <Badge variant="secondary" className={`${config.bgColor} ${config.borderColor} border`}>
        <Icon className={`h-3 w-3 mr-1 ${config.color} ${config.spinning ? 'animate-spin' : ''}`} />
        {config.label}
      </Badge>
    )
  }

  return (
    <Card className={`${config.borderColor} ${config.bgColor} border-2`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={`h-5 w-5 ${config.color} mt-0.5 ${config.spinning ? 'animate-spin' : ''}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${config.color}`}>{config.label}</span>
              {requestId && (
                <span className="text-xs text-muted-foreground">#{requestId}</span>
              )}
            </div>
            
            {position !== undefined && status === 'pending' && (
              <p className="text-sm text-muted-foreground mt-1">
                队列位置: 第 {position} 位
              </p>
            )}

            {estimatedTime && (
              <p className="text-sm text-muted-foreground mt-1">
                预计等待: {estimatedTime}
              </p>
            )}

            {message && (
              <p className="text-sm mt-2">{message}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

