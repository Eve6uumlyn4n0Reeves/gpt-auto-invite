"use client"

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { fetchChildren, autoPullChildren, syncChildren, removeChild } from '@/lib/api/mothers'
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
  const { succeed } = useSuccessFlow()

  const title = useMemo(() => `子号管理 · ${motherName}`, [motherName])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetchChildren(motherId)
      if ((res as any).ok === false) throw new Error((res as any).error || '加载失败')
      // domain wrapper 返回 { response, ok, data }
      const data = (res as any).data
      setItems((data?.items as ChildItem[]) || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, motherId])

  const handleAutoPull = async () => {
    const res = await autoPullChildren(motherId)
    if ((res as any).ok === false) throw new Error((res as any).error || '拉取失败')
    await succeed(res, () => ({ title: '已触发', message: '已拉取成员并创建子号' }))
    await load()
  }

  const handleSync = async () => {
    const res = await syncChildren(motherId)
    if ((res as any).ok === false) throw new Error((res as any).error || '同步失败')
    await succeed(res, (r) => ({ title: '已同步', message: r.message || '成员信息已同步' }))
    await load()
  }

  const handleRemove = async (childId: number) => {
    const res = await removeChild(childId)
    if ((res as any).ok === false) throw new Error((res as any).error || '移除失败')
    await succeed(res, () => ({ title: '已移除', message: `子号 #${childId} 已移除` }))
    await load()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>查看并管理该母号下的子号列表。</DialogDescription>
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

