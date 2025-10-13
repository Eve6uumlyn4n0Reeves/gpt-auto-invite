'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { RefreshCw } from 'lucide-react'
import { useAdminContext, useAdminActions } from '@/store/admin-context'
import { useAdminSimple } from '@/hooks/use-admin-simple'
import { MobileNavigation } from '@/components/mobile-navigation'

export const AdminHeader: React.FC = () => {
  const { state } = useAdminContext()
  const { setAutoRefresh } = useAdminActions()
  const { logout, loadStats } = useAdminSimple()

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

  return (
    <header className="border-b border-border/40 bg-card/30 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <MobileNavigation
              currentTab={state.currentTab}
              onTabChange={(tab) => {/* Handle tab change */}}
              onLogout={handleLogout}
            />

            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-brand-secondary rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-primary-foreground font-bold text-sm sm:text-base">⚙️</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg sm:text-xl font-semibold bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent">
                管理员后台
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">GPT Team 邀请服务管理</p>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-3">
            {/* Service Status */}
            <div className="flex items-center space-x-2 px-3 py-2 rounded-full bg-background/50 border border-border/40">
              <div className={`w-2 h-2 rounded-full ${getServiceStatusColor()}`} />
              <span className="text-xs text-muted-foreground">{getServiceStatusText()}</span>
              {state.serviceStatus.lastCheck && (
                <span className="text-xs text-muted-foreground opacity-60">
                  {new Date(state.serviceStatus.lastCheck).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            {/* Auto Refresh Toggle */}
            <div className="flex items-center space-x-2 px-3 py-2 rounded-full bg-background/50 border border-border/40">
              <Switch
                checked={state.autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <span className="text-xs text-muted-foreground">自动刷新</span>
            </div>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={state.statsLoading}
              className="hover:scale-105 transition-transform bg-transparent"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${state.statsLoading ? "animate-spin" : ""}`} />
              刷新数据
            </Button>

            {/* Logout Button */}
            <Button
              variant="outline"
              onClick={handleLogout}
              className="border-border/60 bg-transparent hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-600 transition-all"
            >
              🚪 退出登录
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
