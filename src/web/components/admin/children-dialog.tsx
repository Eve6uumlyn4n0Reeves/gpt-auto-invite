"use client"

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { fetchChildren, autoPullChildren, syncChildren, removeChild, fetchMotherDetail, type MotherSeatSummaryOut } from '@/lib/api/mothers'
import { useSuccessFlow } from '@/hooks/use-success-flow'

type ChildItem = {
  id: number
  child_id: string
  name: string
  email: string
  team_id: string
  team_name: string
  status: string
  member_id?: string | null
  created_at: string
}

interface ChildrenDialogProps {
  motherId: number
  motherName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChildrenDialog({ motherId, motherName, open, onOpenChange }: ChildrenDialogProps) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ChildItem[]>([])
  const [seats, setSeats] = useState<MotherSeatSummaryOut[]>([])
  const [seatsLoading, setSeatsLoading] = useState(false)
  const { succeed } = useSuccessFlow()

  const title = useMemo(() => `子号管理 · ${motherName}`, [motherName])

  const load = async () => {
    setLoading(true)
    setSeatsLoading(true)
    try {
      const [childrenRes, detailRes] = await Promise.all([
        fetchChildren(motherId),
        fetchMotherDetail(motherId),
      ])
      if (!('ok' in childrenRes) || !childrenRes.ok) {
        throw new Error(childrenRes.error || '加载子号失败')
      }
      const childItems = Array.isArray(childrenRes.data?.items) ? (childrenRes.data!.items as ChildItem[]) : []
      setItems(childItems)

      if (('ok' in detailRes) && detailRes.ok && detailRes.data?.data) {
        setSeats(detailRes.data.data.seats ?? [])
      } else {
        setSeats([])
      }
    } finally {
      setLoading(false)
      setSeatsLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, motherId])

  const handleAutoPull = async () => {
    const result = await succeed(
      async () => {
        const res = await autoPullChildren(motherId)
        if (!('ok' in res) || !res.ok) {
          throw new Error(res.error || '拉取失败')
        }
        return res.data
      },
      (data) => ({
        title: '已触发',
        message: `已拉取成员并创建子号${data?.created_count ? `（新增 ${data.created_count} 个）` : ''}`,
      }),
    )
    if (result.ok) {
      await load()
    }
  }

  const handleSync = async () => {
    const result = await succeed(
      async () => {
        const res = await syncChildren(motherId)
        if (!('ok' in res) || !res.ok) {
          throw new Error(res.error || '同步失败')
        }
        return res.data
      },
      (data) => ({
        title: '已同步',
        message: data?.message || `成员信息已同步（成功 ${data?.synced_count ?? 0} 个）`,
      }),
    )
    if (result.ok) {
      await load()
    }
  }

  const handleRemove = async (childId: number) => {
    const result = await succeed(
      async () => {
        const res = await removeChild(childId)
        if (!('ok' in res) || !res.ok) {
          throw new Error(res.error || '移除失败')
        }
        return { childId }
      },
      () => ({
        title: '已移除',
        message: `子号 #${childId} 已移除`,
      }),
    )
    if (result.ok) {
      await load()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>查看席位与子号，支持拉取与同步。</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleAutoPull} disabled={loading}>
            拉取成员创建子号
          </Button>
          <Button size="sm" variant="outline" onClick={handleSync} disabled={loading}>
            同步成员信息
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            刷新
          </Button>
        </div>

        <Separator className="my-3" />

        {/* 席位明细（只读，来自 /mothers/{id}） */}
        <div className="space-y-2">
          <div className="text-sm font-medium">席位明细</div>
          <div className="rounded border bg-muted/30 max-h-40 overflow-auto">
            {seatsLoading ? (
              <div className="p-2 text-xs text-muted-foreground">加载席位中...</div>
            ) : seats.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground">暂无席位数据</div>
            ) : (
              seats.map((s) => (
                <div key={s.slot_index} className="px-2 py-1 text-xs flex items-center justify-between border-b last:border-b-0">
                  <div>
                    <span className="text-muted-foreground mr-1">#{s.slot_index}</span>
                    <span className="mr-2">{s.status}</span>
                    {s.email && <span className="mr-2">{s.email}</span>}
                    {s.team_id && <span className="text-muted-foreground">[{s.team_id}]</span>}
                  </div>
                  {s.held_until && (
                    <span className="text-muted-foreground">占位至 {new Date(s.held_until).toLocaleString()}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <Separator className="my-3" />

        <div className="max-h-80 overflow-auto space-y-2">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground">暂无子号</div>
          )}
          {items.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border px-3 py-2">
              <div className="text-sm">
                <div className="font-medium">{c.name || c.email}</div>
                <div className="text-xs text-muted-foreground">
                  {c.email} · {c.team_name || c.team_id} · {c.status}
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => handleRemove(c.id)}>
                移除
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
