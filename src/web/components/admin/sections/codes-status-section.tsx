import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminRateLimitDashboard } from "@/components/admin-rate-limit-dashboard"
import { VirtualTable, type VirtualTableColumn } from "@/components/virtual-table"
import { PaginationControls } from "@/components/admin/pagination-controls"
import type { CodeData } from "@/store/admin-context"

export type CodeStatusTableColumn = VirtualTableColumn<CodeData>

interface CodesStatusSectionProps {
  loading: boolean
  filterStatus: string
  onFilterStatusChange: (value: string) => void
  codesStatusMother: string
  onCodesStatusMotherChange: (value: string) => void
  codesStatusTeam: string
  onCodesStatusTeamChange: (value: string) => void
  codesStatusBatch: string
  onCodesStatusBatchChange: (value: string) => void
  searchTerm: string
  onSearchTermChange: (value: string) => void
  uniqueMothers: string[]
  uniqueTeams: string[]
  uniqueBatches: string[]
  data: CodeData[]
  codeTableColumns: CodeStatusTableColumn[]
  containerHeight: number
  itemHeight: number
  onRowAction: (code: CodeData) => void
  page: number
  pageSize: number
  total: number
  onRefresh: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function CodesStatusSection({
  loading,
  filterStatus,
  onFilterStatusChange,
  codesStatusMother,
  onCodesStatusMotherChange,
  codesStatusTeam,
  onCodesStatusTeamChange,
  codesStatusBatch,
  onCodesStatusBatchChange,
  searchTerm,
  onSearchTermChange,
  uniqueMothers,
  uniqueTeams,
  uniqueBatches,
  data,
  codeTableColumns,
  containerHeight,
  itemHeight,
  onRowAction,
  page,
  pageSize,
  total,
  onRefresh,
  onPageChange,
  onPageSizeChange,
}: CodesStatusSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">兑换码状态总览</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="flex">
            刷新
          </Button>
        </div>
      </div>

      <div className="p-3 sm:p-4 border border-border/40 rounded-lg bg-card/30 backdrop-blur-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <Label className="text-sm">状态</Label>
            <select
              value={filterStatus}
              onChange={(event) => onFilterStatusChange(event.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm"
            >
              <option value="all">全部</option>
              <option value="used">已使用</option>
              <option value="unused">未使用</option>
            </select>
          </div>
          <div>
            <Label className="text-sm">母号</Label>
            <select
              value={codesStatusMother}
              onChange={(event) => onCodesStatusMotherChange(event.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm"
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
            <Label className="text-sm">团队</Label>
            <select
              value={codesStatusTeam}
              onChange={(event) => onCodesStatusTeamChange(event.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm"
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
              <Label className="text-sm">批次</Label>
              <select
                value={codesStatusBatch}
                onChange={(event) => onCodesStatusBatchChange(event.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm"
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

        <div className="mt-3">
          <Label className="text-sm">搜索</Label>
          <Input
            placeholder="搜索兑换码/邮箱/团队/批次"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            className="bg-background/50 border-border/60 mt-1"
          />
        </div>
      </div>

      <VirtualTable<CodeData>
        data={data}
        columns={codeTableColumns}
        onRowAction={(_, code: CodeData) => onRowAction(code)}
        loading={loading}
        emptyMessage="暂无兑换码数据"
        itemHeight={itemHeight}
        containerHeight={containerHeight}
      />

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      <div className="border border-border/40 rounded-lg bg-card/50 backdrop-blur-sm overflow-hidden">
        <AdminRateLimitDashboard />
      </div>
    </div>
  )
}
