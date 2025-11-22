'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useAdminContext } from '@/store/admin-context'

export const StatsCards: React.FC = () => {
  const { state } = useAdminContext()

  if (!state.stats) return null

  const cards = [
    {
      title: '总兑换码',
      value: state.stats.total_codes,
      subtitle: `已使用: ${state.stats.used_codes} (${((state.stats.used_codes / state.stats.total_codes) * 100).toFixed(1)}%)`,
      icon: '🎫',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: '总用户',
      value: state.stats.total_users,
      subtitle: `成功邀请: ${state.stats.successful_invites}`,
      icon: '👥',
      color: 'text-green-600',
      bgColor: 'bg-green-500/10',
    },
    {
      title: '活跃团队',
      value: state.stats.active_teams,
      subtitle: `使用率: ${(state.stats.usage_rate * 100).toFixed(1)}%`,
      icon: '🏢',
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: '待处理邀请',
      value: state.stats.pending_invites,
      subtitle: state.stats.remaining_code_quota !== undefined
        ? `剩余配额: ${state.stats.remaining_code_quota}`
        : '',
      icon: '⏳',
      color: 'text-orange-600',
      bgColor: 'bg-orange-500/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
      {cards.map((card, index) => (
        <Card
          key={index}
          className="border-border/40 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer"
        >
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">
                  {card.title}
                </p>
                <p className={`text-lg sm:text-2xl font-bold ${card.color} mb-1`}>
                  {card.value.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {card.subtitle}
                </p>
              </div>
              <div className={`w-8 h-8 sm:w-12 sm:h-12 ${card.bgColor} rounded-lg flex items-center justify-center flex-shrink-0 ml-2`}>
                <span className={`${card.color} text-sm sm:text-base`}>
                  {card.icon}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}