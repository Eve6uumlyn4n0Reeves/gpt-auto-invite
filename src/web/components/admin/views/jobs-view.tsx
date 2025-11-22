'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchJobs, fetchJob, retryJob, type BatchJobItem } from '@/lib/api/jobs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { JobDetailPanel, type JobDetail } from '@/components/admin/job-detail-panel'
import { Button } from '@/components/ui/button'
import { RefreshCw, Filter } from 'lucide-react'
import { useNotifications } from '@/components/notification-system'

export function JobsView() {
  const [items, setItems] = useState<BatchJobItem[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'pool' | 'users'>('all')
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailData, setDetailData] = useState<JobDetail | null>(null)
  const [retrying, setRetrying] = useState(false)
  const notifications = useNotifications()

  const load = async (p = page, s = pageSize, status = statusFilter) => {
    setLoading(true)
    const { ok, data } = await fetchJobs({ page: p, page_size: s, status: status || undefined })
    if (ok && data) {
      setItems(data.items || [])
      setTotal(data.pagination?.total || 0)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load(1, pageSize)
  }, [])

  useEffect(() => {
    let timer: any
    if (autoRefresh) {
      timer = setInterval(() => {
        void load(page, pageSize)
      }, 5000)
    }
    return () => timer && clearInterval(timer)
  }, [autoRefresh, page, pageSize])

  const totalPages = useMemo(() => (pageSize > 0 ? Math.ceil(total / pageSize) : 1), [total, pageSize])

  const onPageChange = async (p: number) => {
    const next = Math.max(1, Math.min(p, totalPages || 1))
    setPage(next)
    await load(next, pageSize)
  }

  const onPageSizeChange = async (s: number) => {
    const size = Math.max(1, Math.min(s, 200))
    setPageSize(size)
    setPage(1)
    await load(1, size)
  }

  const openDetail = async (jobId: number) => {
    setDetailLoading(true)
    setDetailOpen(true)
    try {
      const { ok, data } = await fetchJob(jobId)
      if (ok && data) {
        setDetailData(data as JobDetail)
      } else {
        notifications.addNotification({
          type: 'error',
          title: '加载失败',
          message: '无法加载任务详情',
        })
      }
    } catch (error) {
      notifications.addNotification({
        type: 'error',
        title: '加载失败',
        message: '无法加载任务详情',
      })
    } finally {
      setDetailLoading(false)
    }
  }

  const doRetry = async (jobId: number) => {
    setRetrying(true)
    try {
      const { ok } = await retryJob(jobId)
      if (ok) {
        notifications.addNotification({
          type: 'success',
          title: '任务已重试',
          message: `任务 #${jobId} 已重新加入队列`,
        })
        await load(page, pageSize)
        await openDetail(jobId)
      } else {
        notifications.addNotification({
          type: 'error',
          title: '重试失败',
          message: '无法重试该任务',
        })
      }
    } catch (error) {
      notifications.addNotification({
        type: 'error',
        title: '重试失败',
        message: '无法重试该任务',
      })
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 筛选和操作栏 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">任务队列</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load(page, pageSize, statusFilter)}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">筛选:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">类型</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | 'pool' | 'users')}
                className="px-3 py-1.5 rounded-md border border-border/50 bg-background/50 text-sm"
              >
                <option value="all">全部</option>
                <option value="pool">号池同步</option>
                <option value="users">用户邀请</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">状态</span>
              <select
                value={statusFilter}
                onChange={async (e) => {
                  setStatusFilter(e.target.value)
                  await load(1, pageSize, e.target.value)
                }}
                className="px-3 py-1.5 rounded-md border border-border/50 bg-background/50 text-sm"
              >
                <option value="">全部</option>
                <option value="pending">待处理</option>
                <option value="running">执行中</option>
                <option value="succeeded">已完成</option>
                <option value="failed">失败</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm ml-auto">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              自动刷新 (5秒)
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">类型</th>
                  <th className="px-4 py-2 text-left">状态</th>
                  <th className="px-4 py-2 text-left">成功/失败/总数</th>
                  <th className="px-4 py-2 text-left">创建</th>
                  <th className="px-4 py-2 text-left">开始</th>
                  <th className="px-4 py-2 text-left">完成</th>
                </tr>
              </thead>
              <tbody>
                {items.filter((j) => {
                  if (typeFilter === 'pool') return j.job_type === 'pool_sync_mother'
                  if (typeFilter === 'users') return j.job_type !== 'pool_sync_mother'
                  return true
                }).length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                      {loading ? '加载中…' : '暂无任务'}
                    </td>
                  </tr>
                )}
                {items.filter((j) => {
                  if (typeFilter === 'pool') return j.job_type === 'pool_sync_mother'
                  if (typeFilter === 'users') return j.job_type !== 'pool_sync_mother'
                  return true
                }).map((j) => (
                  <tr key={j.id} className="border-b border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => void openDetail(j.id)}>
                    <td className="px-4 py-2">#{j.id}</td>
                    <td className="px-4 py-2">
                      {j.job_type === 'pool_sync_mother' ? (
                        <span className="inline-block rounded border border-purple-500/30 bg-purple-500/10 text-purple-600 px-2 py-0.5">池化同步</span>
                      ) : (
                        <span className="inline-block rounded border border-muted/40 px-2 py-0.5 text-muted-foreground">{j.job_type}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded border px-2 py-0.5 ${
                        j.status === 'succeeded'
                          ? 'border-green-500/30 bg-green-500/10 text-green-600'
                          : j.status === 'failed'
                            ? 'border-red-500/30 bg-red-500/10 text-red-600'
                            : j.status === 'running'
                              ? 'border-blue-500/30 bg-blue-500/10 text-blue-600'
                              : 'border-border/40 text-muted-foreground'
                      }`}>{j.status}</span>
                    </td>
                    <td className="px-4 py-2">{j.success_count ?? 0}/{j.failed_count ?? 0}/{j.total_count ?? 0}</td>
                    <td className="px-4 py-2">{j.created_at ? new Date(j.created_at).toLocaleString() : '-'}</td>
                    <td className="px-4 py-2">{j.started_at ? new Date(j.started_at).toLocaleString() : '-'}</td>
                    <td className="px-4 py-2">{j.finished_at ? new Date(j.finished_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      <JobDetailPanel
        open={detailOpen}
        onOpenChange={setDetailOpen}
        job={detailData}
        onRetry={doRetry}
        retrying={retrying}
      />
    </div>
  )
}
