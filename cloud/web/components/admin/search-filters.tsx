'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminContext } from '@/store/admin-context'
import { useAdminActions } from '@/store/admin-context'
import { useFilteredData } from '@/hooks/use-filtered-data'
import { useMobileGestures } from '@/hooks/use-mobile-gestures'

export const SearchFilters: React.FC = () => {
  const { state } = useAdminContext()
  const { setSearchTerm, setFilterStatus, setSortBy, setSortOrder, setCodesStatusMother, setCodesStatusTeam, setCodesStatusBatch } = useAdminActions()
  const { uniqueMothers, uniqueTeams, uniqueBatches } = useFilteredData()
  const { isTouch } = useMobileGestures()

  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false)

  const handleClearFilters = () => {
    setSearchTerm('')
    setFilterStatus('all')
    setSortBy('created_at')
    setSortOrder('desc')
  }

  return (
    <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
      {/* Main Search and Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="flex-1">
          <Input
            placeholder="搜索用户、兑换码、团队..."
            value={state.searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`bg-background/50 border-border/60 focus:ring-2 focus:ring-primary/20 ${
              isTouch ? "min-h-[44px] text-base" : ""
            }`}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={state.filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={`px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm focus:ring-2 focus:ring-primary/20 ${
              isTouch ? "min-h-[44px]" : ""
            }`}
          >
            <option value="all">所有状态</option>
            <option value="sent">已发送</option>
            <option value="pending">待处理</option>
            <option value="failed">失败</option>
            <option value="used">已使用</option>
            <option value="unused">未使用</option>
          </select>
          <Button
            variant="outline"
            size={isTouch ? "default" : "sm"}
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="bg-transparent hover:bg-primary/10"
          >
            高级筛选
          </Button>
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <div className="p-3 sm:p-4 border border-border/40 rounded-lg bg-card/30 backdrop-blur-sm animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <Label className="text-sm font-medium">排序字段</Label>
              <select
                value={state.sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm focus:ring-2 focus:ring-primary/20 ${
                  isTouch ? "min-h-[44px]" : ""
                }`}
              >
                <option value="created_at">创建时间</option>
                <option value="email">邮箱</option>
                <option value="status">状态</option>
                <option value="team_name">团队</option>
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">排序方向</Label>
              <select
                value={state.sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm focus:ring-2 focus:ring-primary/20 ${
                  isTouch ? "min-h-[44px]" : ""
                }`}
              >
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size={isTouch ? "default" : "sm"}
                onClick={handleClearFilters}
                className="bg-transparent hover:bg-primary/10 w-full sm:w-auto"
              >
                重置筛选
              </Button>
            </div>
          </div>

          {/* Additional filters for code status view */}
          {state.currentTab === 'codes-status' && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <Label className="text-sm font-medium">母号</Label>
                <select
                  value={state.codesStatusMother}
                  onChange={(e) => setCodesStatusMother(e.target.value)}
                  className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm focus:ring-2 focus:ring-primary/20 ${
                    isTouch ? "min-h-[44px]" : ""
                  }`}
                >
                  <option value="">全部</option>
                  {uniqueMothers.map((mother) => (
                    <option key={mother} value={mother}>
                      {mother}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium">团队</Label>
                <select
                  value={state.codesStatusTeam}
                  onChange={(e) => setCodesStatusTeam(e.target.value)}
                  className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm focus:ring-2 focus:ring-primary/20 ${
                    isTouch ? "min-h-[44px]" : ""
                  }`}
                >
                  <option value="">全部</option>
                  {uniqueTeams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium">批次</Label>
                <select
                  value={state.codesStatusBatch}
                  onChange={(e) => setCodesStatusBatch(e.target.value)}
                  className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm focus:ring-2 focus:ring-primary/20 ${
                    isTouch ? "min-h-[44px]" : ""
                  }`}
                >
                  <option value="">全部</option>
                  {uniqueBatches.map((batch) => (
                    <option key={batch} value={batch}>
                      {batch}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
