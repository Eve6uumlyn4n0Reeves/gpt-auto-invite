'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAdminContext, useAdminActions } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { ADMIN_TAB_ROUTES } from '@/lib/admin-navigation'

export const AdminHeader: React.FC = () => {
  const { state } = useAdminContext()
  const { setAutoRefresh } = useAdminActions()
  const { logout, loadStats } = useAdminSimple()
  const pathname = usePathname()

  const handleLogout = async () => {
    await logout()
  }

  const handleRefresh = () => {
    loadStats()
  }

  const getServiceStatusColor = () => {
    switch (state.serviceStatus.backend) {
      case 'online':
        return 'bg-green-500 animate-pulse'
      case 'offline':
        return 'bg-red-500'
      default:
        return 'bg-yellow-500 animate-pulse'
    }
  }

  const getServiceStatusText = () => {
    switch (state.serviceStatus.backend) {
      case 'online':
        return '在线'
      case 'offline':
        return '离线'
      default:
        return '检查中'
    }
  }

  const dbUsersOk = state.serviceStatus.db?.users?.ok
  const dbPoolOk = state.serviceStatus.db?.pool?.ok
  const usersTitle = state.serviceStatus.db?.users
    ? `users: ${state.serviceStatus.db.users.dialect || ''} ${state.serviceStatus.db.users.alembic_version || ''} @ ${state.serviceStatus.db.users.url || ''}`
    : 'users: 未知'
  const poolTitle = state.serviceStatus.db?.pool
    ? `pool: ${state.serviceStatus.db.pool.dialect || ''} ${state.serviceStatus.db.pool.alembic_version || ''} @ ${state.serviceStatus.db.pool.url || ''}`
    : 'pool: 未知'

  const navItems = [
    { href: ADMIN_TAB_ROUTES.overview, label: '数据总览' },
    { href: ADMIN_TAB_ROUTES.mothers, label: '母号管理' },
    { href: ADMIN_TAB_ROUTES.users, label: '用户管理' },
    { href: ADMIN_TAB_ROUTES.codes, label: '兑换码' },
    { href: ADMIN_TAB_ROUTES['codes-status'], label: '码状态' },
    { href: ADMIN_TAB_ROUTES['bulk-import'], label: '批量导入' },
    { href: ADMIN_TAB_ROUTES['bulk-history'], label: '批量历史' },
    { href: ADMIN_TAB_ROUTES.jobs, label: '任务' },
    { href: ADMIN_TAB_ROUTES.audit, label: '审计日志' },
    { href: ADMIN_TAB_ROUTES.settings, label: '设置' },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-card/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-secondary shadow-lg">
              <span className="text-primary-foreground text-xl font-bold">⚙️</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">管理后台</h1>
              <p className="text-sm text-muted-foreground">GPT Team 邀请服务管理</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border/40 bg-background/50 px-3 py-2">
              <div className={`h-2 w-2 rounded-full ${getServiceStatusColor()}`} />
              <span className="text-xs text-muted-foreground">{getServiceStatusText()}</span>
              {state.serviceStatus.lastCheck && (
                <span className="text-xs text-muted-foreground/70">
                  {new Date(state.serviceStatus.lastCheck).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-full border border-border/40 bg-background/50 px-3 py-2" title={usersTitle}>
              <div className={`h-2 w-2 rounded-full ${dbUsersOk === true ? 'bg-green-500' : dbUsersOk === false ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
              <span className="text-xs text-muted-foreground">Users DB</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/40 bg-background/50 px-3 py-2" title={poolTitle}>
              <div className={`h-2 w-2 rounded-full ${dbPoolOk === true ? 'bg-green-500' : dbPoolOk === false ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
              <span className="text-xs text-muted-foreground">Pool DB</span>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-border/40 bg-background/50 px-3 py-2">
              <Switch checked={state.autoRefresh} onCheckedChange={setAutoRefresh} />
              <span className="text-xs text-muted-foreground">自动刷新</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={state.statsLoading}
              className="bg-transparent transition-transform hover:scale-105"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${state.statsLoading ? "animate-spin" : ""}`} />
              刷新数据
            </Button>

            <Button
              variant="outline"
              onClick={handleLogout}
              className="border-border/60 bg-transparent transition-all hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600"
            >
              🚪 退出登录
            </Button>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
