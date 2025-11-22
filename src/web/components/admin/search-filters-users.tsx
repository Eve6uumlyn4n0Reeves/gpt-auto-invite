'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUsersContext, useUsersActions } from '@/domains/users/store'
import { InviteStatus, CodeStatus } from '@/shared/api-types'
import { useMobileGestures } from '@/hooks/use-mobile-gestures'

export const SearchFiltersUsers: React.FC = () => {
  const { state } = useUsersContext()
  const { setSearchTerm, setFilterStatus } = useUsersActions()
  const { isTouch } = useMobileGestures()

  const handleClear = () => {
    setSearchTerm('')
    setFilterStatus('all')
  }

  return (
    <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="flex-1">
          <Input
            placeholder="搜索用户、兑换码、团队..."
            value={state.searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`bg-background/50 border-border/60 focus:ring-2 focus:ring-primary/20 ${
              isTouch ? 'min-h-[44px] text-base' : ''
            }`}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={state.filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className={`px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm focus:ring-2 focus:ring-primary/20 ${
              isTouch ? 'min-h-[44px]' : ''
            }`}
          >
            <option value={'all'}>所有状态</option>
            <option value={InviteStatus.sent}>已发送</option>
            <option value={InviteStatus.pending}>待处理</option>
            <option value={InviteStatus.failed}>失败</option>
            <option value={CodeStatus.used}>已使用</option>
            <option value={CodeStatus.unused}>未使用</option>
          </select>
          <Button variant="outline" size={isTouch ? 'default' : 'sm'} onClick={handleClear}>
            重置
          </Button>
        </div>
      </div>
    </div>
  )
}
