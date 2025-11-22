'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Clock, CheckCircle, XCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRealtimeQueue } from '@/hooks/use-realtime-queue'
import { usersAdminRequest } from '@/lib/api/admin-client'
import type { SwitchRequestOut } from '@/schemas'
import { VirtualTable, type VirtualTableColumn } from '@/components/virtual-table'
import { useNotifications } from '@/components/notification-system'

export function SwitchQueueView() {
  const [requests, setRequests] = useState<SwitchRequestOut[]>([])
  const [loading, setLoading] = useState(false)
  const queue = useRealtimeQueue(true)
  const notifications = useNotifications()

  const loadRequests = async () => {
    setLoading(true)
    try {
      const res = await usersAdminRequest<SwitchRequestOut[]>('/switch/requests')
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '加载失败')
      }
      setRequests(res.data || [])
    } catch (error) {
      console.error('Failed to load switch requests:', error)
      notifications.addNotification({
        type: 'error',
        title: '加载失败',
        message: '无法加载切换队列数据',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRequests()
  }, [])

  // 监听实时更新
  useEffect(() => {
    if (queue.updates.length > 0) {
      const lastUpdate = queue.updates[0]
      if (lastUpdate.type === 'queue_update') {
        void loadRequests()
      }
    }
  }, [queue.updates])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle className="h-4 w-4 text-success" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-error" />
      case 'expired':
        return <AlertCircle className="h-4 w-4 text-warning" />
      case 'pending':
      case 'running':
        return <Clock className="h-4 w-4 text-primary animate-pulse" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '排队中',
      running: '执行中',
      succeeded: '成功',
      failed: '失败',
      expired: '已过期',
    }
    return map[status] || status
  }

  const getStatusClass = (status: string) => {
    const map: Record<string, string> = {
      succeeded: 'border-success/30 bg-success/20 text-success',
      failed: 'border-error/30 bg-error/20 text-error',
      expired: 'border-warning/30 bg-warning/20 text-warning',
      pending: 'border-primary/30 bg-primary/20 text-primary',
      running: 'border-blue-500/30 bg-blue-500/20 text-blue-600',
    }
    return map[status] || 'border-border/40 bg-muted'
  }

  const columns: VirtualTableColumn<SwitchRequestOut>[] = [
    {
      key: 'id',
      label: 'ID',
      width: 80,
      render: (value) => <span className="font-mono text-sm">#{value}</span>,
    },
    {
      key: 'email',
      label: '邮箱',
      render: (value) => <span className="font-medium">{value}</span>,
    },
    {
      key: 'status',
      label: '状态',
      width: 120,
      render: (value: string) => (
        <div className="flex items-center gap-2">
          {getStatusIcon(value)}
          <span className={`rounded-full border px-2 py-1 text-xs font-medium ${getStatusClass(value)}`}>
            {getStatusText(value)}
          </span>
        </div>
      ),
    },
    {
      key: 'attempts',
      label: '尝试次数',
      width: 100,
      render: (value) => <span className="text-sm">{value || 0}</span>,
    },
    {
      key: 'queued_at',
      label: '入队时间',
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {value ? new Date(value).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      key: 'expires_at',
      label: '过期时间',
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {value ? new Date(value).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      key: 'last_error',
      label: '最后错误',
      render: (value) => (
        <span className="text-xs text-error truncate max-w-[200px]" title={value || ''}>
          {value || '-'}
        </span>
      ),
    },
  ]

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const runningRequests = requests.filter((r) => r.status === 'running')
  const recentCompleted = requests.filter((r) => ['succeeded', 'failed', 'expired'].includes(r.status)).slice(0, 10)

  return (
    <div className="space-y-6">
      {/* 实时状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">连接状态</CardTitle>
              {queue.connected ? (
                <Wifi className="h-4 w-4 text-success" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {queue.connected ? (
                <span className="text-success">已连接</span>
              ) : (
                <span className="text-muted-foreground">未连接</span>
              )}
            </div>
            {queue.lastUpdate && (
              <p className="text-xs text-muted-foreground mt-2">
                最后更新: {queue.lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">排队中</CardTitle>
              <Clock className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{pendingRequests.length}</div>
            <p className="text-xs text-muted-foreground mt-2">等待处理的切换请求</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">执行中</CardTitle>
              <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{runningRequests.length}</div>
            <p className="text-xs text-muted-foreground mt-2">正在处理的请求</p>
          </CardContent>
        </Card>
      </div>

      {/* 排队列表 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>切换队列</CardTitle>
              <CardDescription>实时查看和管理切换请求</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadRequests()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {loading ? '加载中...' : '暂无切换请求'}
            </div>
          ) : (
            <VirtualTable<SwitchRequestOut>
              data={requests}
              columns={columns}
              loading={loading}
              emptyMessage="暂无切换请求"
              itemHeight={60}
              containerHeight={500}
            />
          )}
        </CardContent>
      </Card>

      {/* 实时更新日志 */}
      {queue.updates.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">实时更新</CardTitle>
              <Button variant="ghost" size="sm" onClick={queue.clearUpdates}>
                清空
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {queue.updates.slice(0, 20).map((update, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-2 rounded-lg border border-border/40 bg-card/50 text-sm"
                >
                  <Badge variant="secondary" className="shrink-0">
                    {update.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    {update.data?.message && (
                      <div className="text-foreground">{update.data.message}</div>
                    )}
                    {update.data?.email && (
                      <div className="text-xs text-muted-foreground">邮箱: {update.data.email}</div>
                    )}
                  </div>
                  {update.data?.timestamp && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(update.data.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

