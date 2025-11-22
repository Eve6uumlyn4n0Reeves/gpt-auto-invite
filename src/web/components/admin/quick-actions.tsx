'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Activity, Clock, Server, Search, Command } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAdminContext } from '@/store/admin-context'
import { SidebarTrigger } from '@/components/ui/sidebar'

interface QuickActionsProps {
  onSearchClick?: () => void
}

export function QuickActions({ onSearchClick }: QuickActionsProps) {
  const router = useRouter()
  const { state } = useAdminContext()

  const quickActions = [
    {
      icon: Plus,
      label: '生成兑换码',
      action: () => router.push('/admin/codes#generate-codes-section'),
    },
    {
      icon: Activity,
      label: '查看任务',
      action: () => router.push('/admin/jobs'),
      badge: 0, // TODO: 从 state 获取待处理任务数
    },
    {
      icon: Clock,
      label: '切换队列',
      action: () => router.push('/admin/switch-queue'),
      badge: 0, // TODO: 从 state 获取排队数
    },
  ]

  return (
    <div className="flex items-center gap-2">
      <SidebarTrigger />
      
      {/* 快捷搜索按钮 */}
      <Button
        variant="outline"
        size="sm"
        onClick={onSearchClick}
        className="hidden sm:flex items-center gap-2 text-muted-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">搜索...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 md:inline-flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </Button>

      {/* 快捷操作菜单 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">快捷操作</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>常用功能</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {quickActions.map((action, index) => (
            <DropdownMenuItem
              key={index}
              onClick={action.action}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <action.icon className="h-4 w-4" />
                <span>{action.label}</span>
              </div>
              {action.badge !== undefined && action.badge > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {action.badge}
                </Badge>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 系统状态指示 */}
      <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-border/40 bg-background/50 px-3 py-1.5">
        <div
          className={`h-2 w-2 rounded-full ${
            state.serviceStatus.backend === 'online'
              ? 'bg-success'
              : state.serviceStatus.backend === 'offline'
                ? 'bg-error'
                : 'bg-warning animate-pulse'
          }`}
        />
        <span className="text-xs text-muted-foreground">
          {state.serviceStatus.backend === 'online' ? '在线' : '离线'}
        </span>
      </div>
    </div>
  )
}

