'use client'

import * as React from 'react'
import { Clock, CheckCircle2, XCircle, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
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
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

export interface JobDetail {
  id: number
  job_type: string
  status: string
  actor?: string
  payload?: any
  total_count?: number
  success_count?: number
  failed_count?: number
  last_error?: string
  started_at?: string
  finished_at?: string
  created_at?: string
  attempts?: number
  max_attempts?: number
}

interface JobDetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: JobDetail | null
  onRetry?: (jobId: number) => void | Promise<void>
  retrying?: boolean
}

export function JobDetailPanel({
  open,
  onOpenChange,
  job,
  onRetry,
  retrying = false,
}: JobDetailPanelProps) {
  if (!job) return null

  const getStatusIcon = () => {
    switch (job.status) {
      case 'succeeded':
        return <CheckCircle2 className="h-5 w-5 text-success" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-error" />
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      case 'pending':
        return <Clock className="h-5 w-5 text-warning" />
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getStatusColor = () => {
    switch (job.status) {
      case 'succeeded':
        return 'text-success'
      case 'failed':
        return 'text-error'
      case 'running':
        return 'text-blue-500'
      case 'pending':
        return 'text-warning'
      default:
        return 'text-muted-foreground'
    }
  }

  const progress = job.total_count
    ? Math.round((((job.success_count || 0) + (job.failed_count || 0)) / job.total_count) * 100)
    : 0

  const canRetry = ['failed', 'succeeded'].includes(job.status) && onRetry

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon()}
            <span>任务详情 #{job.id}</span>
          </DialogTitle>
          <DialogDescription>
            类型: {job.job_type} · 执行者: {job.actor || '系统'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-200px)]">
          <div className="space-y-4 pr-4">
            {/* 状态信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">状态</div>
                <Badge variant="secondary" className={`${getStatusColor()} text-sm`}>
                  {job.status}
                </Badge>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">重试次数</div>
                <div className="text-sm">
                  {job.attempts || 0} / {job.max_attempts || 3}
                </div>
              </div>
            </div>

            {/* 进度条 */}
            {job.total_count !== undefined && job.total_count > 0 && (
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">执行进度</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>成功: {job.success_count || 0}</span>
                  <span>失败: {job.failed_count || 0}</span>
                  <span>总计: {job.total_count}</span>
                </div>
              </div>
            )}

            <Separator />

            {/* 时间信息 */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">创建时间</span>
                <span>{job.created_at ? new Date(job.created_at).toLocaleString() : '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">开始时间</span>
                <span>{job.started_at ? new Date(job.started_at).toLocaleString() : '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">完成时间</span>
                <span>{job.finished_at ? new Date(job.finished_at).toLocaleString() : '-'}</span>
              </div>
              {job.started_at && job.finished_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">耗时</span>
                  <span>
                    {Math.round(
                      (new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) /
                        1000,
                    )}{' '}
                    秒
                  </span>
                </div>
              )}
            </div>

            <Separator />

            {/* Payload */}
            {job.payload && (
              <div>
                <div className="text-sm font-medium mb-2">任务参数</div>
                <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto border border-border/40">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              </div>
            )}

            {/* 错误信息 */}
            {job.last_error && (
              <div>
                <div className="text-sm font-medium mb-2 text-error">错误信息</div>
                <div className="text-sm bg-error/10 border border-error/30 rounded-lg p-3">
                  {job.last_error}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          {canRetry && (
            <Button
              onClick={() => onRetry(job.id)}
              disabled={retrying}
              variant="default"
            >
              {retrying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  重试中...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重试任务
                </>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

