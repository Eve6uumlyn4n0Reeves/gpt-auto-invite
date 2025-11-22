'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Ticket,
  ListChecks,
  Upload,
  History,
  ListTodo,
  FileText,
  Settings,
  Server,
  RefreshCw,
  LogOut,
  ChevronRight,
  Star,
  Layers3,
  BookOpen,
  ShuffleIcon,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAdminContext, useAdminActions } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'

type NavItem = {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number | string
  variant?: 'default' | 'favorite'
}

type NavGroup = {
  label: string
  items: NavItem[]
}

export function AppSidebar() {
  const pathname = usePathname()
  const { state } = useAdminContext()
  const { setAutoRefresh } = useAdminActions()
  const { logout, loadStats } = useAdminSimple()
  const { state: sidebarState } = useSidebar()

  // 导航分组
  const navGroups: NavGroup[] = [
    {
      label: '核心业务',
      items: [
        { title: '数据总览', url: '/admin/overview', icon: LayoutDashboard },
        { title: '母号管理', url: '/admin/mothers', icon: Server },
        { title: '用户管理', url: '/admin/users', icon: Users },
        { title: '兑换码', url: '/admin/codes', icon: Ticket },
        { title: '码状态', url: '/admin/codes-status', icon: ListChecks },
      ],
    },
    {
      label: '运营管理',
      items: [
        { title: '号池组', url: '/admin/pool-groups', icon: Layers3 },
        { title: '切换队列', url: '/admin/switch-queue', icon: ShuffleIcon },
        { title: '任务队列', url: '/admin/jobs', icon: ListTodo },
        { title: '批量导入', url: '/admin/bulk-import', icon: Upload },
        { title: '批量历史', url: '/admin/bulk-history', icon: History },
      ],
    },
    {
      label: '系统管理',
      items: [
        { title: '自动录入', url: '/admin/auto-ingest', icon: BookOpen },
        { title: '审计日志', url: '/admin/audit', icon: FileText },
        { title: '系统设置', url: '/admin/settings', icon: Settings },
      ],
    },
  ]

  const getServiceStatusColor = () => {
    switch (state.serviceStatus.backend) {
      case 'online':
        return 'bg-success'
      case 'offline':
        return 'bg-error'
      default:
        return 'bg-warning'
    }
  }

  const handleLogout = async () => {
    await logout()
  }

  const handleRefresh = () => {
    loadStats()
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-secondary shadow-md">
            <span className="text-lg font-bold text-primary-foreground">⚙️</span>
          </div>
          {sidebarState === 'expanded' && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold">GPT管理</span>
              <span className="text-xs text-muted-foreground">团队邀请服务</span>
            </div>
          )}
        </div>
        <SidebarSeparator />
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group, index) => (
          <SidebarGroup key={index}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname === item.url
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={sidebarState === 'collapsed' ? item.title : undefined}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        
        {/* 系统状态 */}
        <div className="px-2 py-2 space-y-2">
          {sidebarState === 'expanded' ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">后端服务</span>
                <div className="flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${getServiceStatusColor()}`} />
                  <span className="text-muted-foreground">
                    {state.serviceStatus.backend === 'online' ? '在线' : '离线'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">自动刷新</span>
                <Switch
                  checked={state.autoRefresh}
                  onCheckedChange={setAutoRefresh}
                  className="scale-75"
                />
              </div>
            </>
          ) : (
            <div className="flex justify-center">
              <div className={`h-2 w-2 rounded-full ${getServiceStatusColor()}`} />
            </div>
          )}
        </div>

        <SidebarSeparator />
        
        {/* 操作按钮 */}
        <div className="p-2 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={state.statsLoading}
            className="w-full justify-start"
          >
            <RefreshCw className={`h-4 w-4 ${state.statsLoading ? 'animate-spin' : ''}`} />
            {sidebarState === 'expanded' && <span>刷新数据</span>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-error hover:text-error hover:bg-error/10"
          >
            <LogOut className="h-4 w-4" />
            {sidebarState === 'expanded' && <span>退出登录</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

