'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchJobs, fetchJob, retryJob, type BatchJobItem } from '@/lib/api/jobs'
import { Card, CardContent } from '@/components/ui/card'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'

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
  const [detailData, setDetailData] = useState<any | null>(null)

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
    const { ok, data } = await fetchJob(jobId)
    if (ok && data) {
      setDetailData(data)
      setDetailOpen(true)
    }
    setDetailLoading(false)
  }

  const doRetry = async (jobId: number) => {
    const { ok } = await retryJob(jobId)
    if (ok) {
      await load(page, pageSize)
      await openDetail(jobId)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">类型</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'pool' | 'users')}
            className="px-2 py-1 rounded border border-border/50 bg-background/50"
          >
            <option value="all">全部</option>
            <option value="pool">号池同步</option>
            <option value="users">用户邀请</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">状态</span>
          <select
            value={statusFilter}
            onChange={async (e) => { setStatusFilter(e.target.value); await load(1, pageSize, e.target.value) }}
            className="px-2 py-1 rounded border border-border/50 bg-background/50"
          >
            <option value="">全部</option>
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm ml-auto">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          自动刷新
        </label>
      </div>

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

      <Drawer open={detailOpen} onOpenChange={setDetailOpen}>
        <DrawerContent className="p-4">
          <DrawerHeader>
            <DrawerTitle>任务详情</DrawerTitle>
            <DrawerDescription>查看 payload 与 last_error，支持重试</DrawerDescription>
          </DrawerHeader>
          {detailLoading && <div className="p-4 text-sm text-muted-foreground">加载中…</div>}
          {!detailLoading && detailData && (
            <div className="space-y-3 p-4">
              <div className="text-sm text-muted-foreground">ID: #{detailData.id} / 类型: {detailData.job_type} / 状态: {detailData.status}</div>
              <div className="text-sm">Payload:</div>
              <pre className="max-h-64 overflow-auto rounded bg-muted/40 p-3 text-xs">
                {JSON.stringify(detailData.payload ?? {}, null, 2)}
              </pre>
              {detailData.last_error && (
                <>
                  <div className="text-sm">Last Error:</div>
                  <pre className="max-h-48 overflow-auto rounded bg-red-500/10 p-3 text-xs text-red-600">
                    {detailData.last_error}
                  </pre>
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button>
                <Button onClick={() => void doRetry(detailData.id)}>重试</Button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
