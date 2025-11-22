'use client'

import { useState } from 'react'
import { Search, Clock, CheckCircle2, XCircle, AlertCircle, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface SwitchStatus {
  id: number
  status: string
  queued_at?: string
  expires_at?: string
  attempts: number
  last_error?: string
  position?: number
}

export function SwitchTracker() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<SwitchStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = async () => {
    if (!email) return

    setLoading(true)
    setError(null)
    setStatus(null)

    try {
      // TODO: 实现查询接口
      const response = await fetch(`/api/switch/status?email=${encodeURIComponent(email)}`)
      const data = await response.json()

      if (data.status) {
        setStatus(data)
      } else {
        setError('未找到相关的切换记录')
      }
    } catch (err) {
      setError('查询失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = () => {
    if (!status) return null

    switch (status.status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-warning" />
      case 'running':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />
      case 'succeeded':
        return <CheckCircle2 className="h-5 w-5 text-success" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-error" />
      case 'expired':
        return <AlertCircle className="h-5 w-5 text-warning" />
      default:
        return null
    }
  }

  const getStatusText = () => {
    if (!status) return ''

    const map: Record<string, string> = {
      pending: '排队中',
      running: '执行中',
      succeeded: '已完成',
      failed: '失败',
      expired: '已过期',
    }
    return map[status.status] || status.status
  }

  const getStatusColor = () => {
    if (!status) return ''

    const map: Record<string, string> = {
      pending: 'border-warning/30 bg-warning/10 text-warning',
      running: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
      succeeded: 'border-success/30 bg-success/10 text-success',
      failed: 'border-error/30 bg-error/10 text-error',
      expired: 'border-warning/30 bg-warning/10 text-warning',
    }
    return map[status.status] || ''
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>切换状态追踪</CardTitle>
          <CardDescription>查询您的切换请求进度</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="tracker-email" className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4" />
                邮箱地址
              </Label>
              <Input
                id="tracker-email"
                type="email"
                placeholder="输入您的邮箱以查询状态"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void checkStatus()
                  }
                }}
                disabled={loading}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={checkStatus} disabled={loading || !email}>
                <Search className="mr-2 h-4 w-4" />
                查询
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-error/30 bg-error/10 p-4 text-sm text-error">
              {error}
            </div>
          )}

          {status && (
            <div className="space-y-4">
              <Separator />
              
              <div className="flex items-center gap-3">
                {getStatusIcon()}
                <div className="flex-1">
                  <div className="font-semibold">当前状态</div>
                  <Badge variant="secondary" className={getStatusColor()}>
                    {getStatusText()}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {status.position !== undefined && (
                  <div>
                    <div className="text-muted-foreground mb-1">排队位置</div>
                    <div className="font-medium">第 {status.position} 位</div>
                  </div>
                )}
                
                <div>
                  <div className="text-muted-foreground mb-1">尝试次数</div>
                  <div className="font-medium">{status.attempts}</div>
                </div>

                {status.queued_at && (
                  <div>
                    <div className="text-muted-foreground mb-1">入队时间</div>
                    <div className="font-medium">{new Date(status.queued_at).toLocaleString()}</div>
                  </div>
                )}

                {status.expires_at && (
                  <div>
                    <div className="text-muted-foreground mb-1">过期时间</div>
                    <div className="font-medium">{new Date(status.expires_at).toLocaleString()}</div>
                  </div>
                )}
              </div>

              {status.last_error && (
                <div className="rounded-lg border border-error/30 bg-error/5 p-3">
                  <div className="text-sm font-medium text-error mb-1">错误信息</div>
                  <div className="text-xs text-muted-foreground">{status.last_error}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

