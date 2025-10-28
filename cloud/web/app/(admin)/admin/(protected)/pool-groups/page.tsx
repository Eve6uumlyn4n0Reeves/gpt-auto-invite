"use client"

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { PoolProvider, usePoolContext } from '@/store/pool/context'
import { useNotifications } from '@/components/notification-system'
import { useRouter } from 'next/navigation'
import { usePoolGroups } from '@/hooks/use-pool-groups'
import { useSuccessFlow } from '@/hooks/use-success-flow'

function PageInner() {
  const { state, actions } = usePoolContext()
  const { refreshGroups, create, saveSettings, syncAll } = usePoolGroups()
  const { succeed } = useSuccessFlow()
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const notifications = useNotifications()
  const router = useRouter()

  useEffect(() => {
    void refreshGroups()
  }, [refreshGroups])

  const doCreate = async () => {
    if (!newName.trim()) return
    const ok = await create(newName.trim(), newDesc || undefined)
    if (ok) {
      setNewName('')
      setNewDesc('')
    }
  }

  const doSave = async () => {
    await succeed(
      async () => {
        const ok = await saveSettings()
        if (!ok) throw new Error('请检查模板占位符是否有效')
        return { ok }
      },
      () => ({ title: '保存成功', message: '已更新模板并生成预览' }),
    )
  }

  const doSyncAll = async () => {
    await succeed(
      async () => {
        const res = await syncAll()
        if (!res.ok) throw new Error(res.error || '入队失败')
        return res
      },
      (res) => ({ title: '已入队', message: `共入队 ${res.count} 个任务`, navigateTo: '/admin/(protected)/jobs' }),
    )
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">号池组管理</h1>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>新建组名</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如：Pool-A" />
          </div>
          <div>
            <Label>描述（可选）</Label>
            <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="用于说明用途" />
          </div>
          <div className="flex items-end">
            <Button onClick={doCreate} disabled={state.creatingGroup || !newName.trim()}>新建组</Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>选择组</Label>
            <Select value={state.selectedGroupId ? String(state.selectedGroupId) : ''} onValueChange={(v) => actions.setSelectedGroup(parseInt(v))}>
              <SelectTrigger>
                <SelectValue placeholder="选择组" />
              </SelectTrigger>
              <SelectContent>
                {state.poolGroups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>团队命名模板</Label>
            <Input value={state.teamTemplate} onChange={(e) => actions.setTemplates({ team: e.target.value })} placeholder="{group}-{date}-{seq3}" />
            <div className="text-xs text-muted-foreground mt-1">允许占位符：{'{group}'}, {'{date}'}, {'{seq3}'}</div>
          </div>
          <div>
            <Label>子号名称模板</Label>
            <Input value={state.childNameTemplate} onChange={(e) => actions.setTemplates({ childName: e.target.value })} placeholder="{group}-{date}-{seq3}" />
            <div className="text-xs text-muted-foreground mt-1">允许占位符：{'{group}'}, {'{date}'}, {'{seq3}'}</div>
          </div>
          <div>
            <Label>子号邮箱模板</Label>
            <Input value={state.childEmailTemplate} onChange={(e) => actions.setTemplates({ childEmail: e.target.value })} placeholder="{group}-{date}-{seq3}@{domain}" />
            <div className="text-xs text-muted-foreground mt-1">允许占位符：{'{group}'}, {'{date}'}, {'{seq3}'}, {'{domain}'}</div>
          </div>
          <div>
            <Label>邮箱域名</Label>
            <Input value={state.emailDomain} onChange={(e) => actions.setTemplates({ domain: e.target.value })} placeholder="例如：aifun.edu.kg" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={doSave} disabled={!state.selectedGroupId || state.savingSettings}>保存并预览</Button>
          <Button variant="secondary" onClick={doSyncAll} disabled={!state.selectedGroupId}>一键同步该组</Button>
        </div>
        {state.namePreview.length > 0 && (
          <div className="text-sm text-muted-foreground">预览：{state.namePreview.join('、 ')}</div>
        )}
      </Card>
    </div>
  )
}

export default function PoolGroupsPage() {
  return (
    <PoolProvider>
      <PageInner />
    </PoolProvider>
  )
}
