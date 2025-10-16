'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchJobs, type BatchJobItem } from '@/lib/api/jobs'
import { Card, CardContent } from '@/components/ui/card'
import { PaginationControls } from '@/components/admin/pagination-controls'

export function JobsView() {
  const [items, setItems] = useState<BatchJobItem[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  const load = async (p = page, s = pageSize) => {
    setLoading(true)
    const { ok, data } = await fetchJobs({ page: p, page_size: s })
    if (ok && data) {
      setItems(data.items || [])
      setTotal(data.pagination?.total || 0)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load(1, pageSize)
  }, [])

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

  return (
    <div className="space-y-4">
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
                {items.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                      {loading ? '加载中…' : '暂无任务'}
                    </td>
                  </tr>
                )}
                {items.map((j) => (
                  <tr key={j.id} className="border-b border-border/40">
                    <td className="px-4 py-2">#{j.id}</td>
                    <td className="px-4 py-2">{j.job_type}</td>
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
    </div>
  )
}

