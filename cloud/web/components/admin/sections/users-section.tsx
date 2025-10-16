import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { VirtualTable, type VirtualTableColumn } from "@/components/virtual-table"
import { PaginationControls } from "@/components/admin/pagination-controls"
import type { UserData } from "@/store/admin-context"

export type UserTableColumn = VirtualTableColumn<UserData>

interface UsersSectionProps {
  loading: boolean
  filteredUsers: UserData[]
  userTableColumns: UserTableColumn[]
  containerHeight: number
  itemHeight: number
  selectedUsers: number[]
  batchOperation: string
  supportedBatchActions: string[]
  batchLoading: boolean
  onClearCache: () => void
  onRefresh: () => void
  onBatchOperationChange: (value: string) => void
  onClearSelection: () => void
  onExecuteBatch: () => void
  onRowAction: (user: UserData) => void
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function UsersSection({
  loading,
  filteredUsers,
  userTableColumns,
  containerHeight,
  itemHeight,
  selectedUsers,
  batchOperation,
  supportedBatchActions,
  batchLoading,
  onClearCache,
  onRefresh,
  onBatchOperationChange,
  onClearSelection,
  onExecuteBatch,
  onRowAction,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: UsersSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">用户管理</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClearCache} className="flex">
            清除缓存
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="flex"
          >
            刷新
          </Button>
        </div>
      </div>

      {selectedUsers.length > 0 && (
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">已选择 {selectedUsers.length} 个用户</span>
                <select
                  value={batchOperation}
                  onChange={(event) => onBatchOperationChange(event.target.value)}
                  className="px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm"
                >
                  <option value="">选择操作</option>
                  {supportedBatchActions.map((action) => (
                    <option key={action} value={action}>
                      {action === "resend"
                        ? "重发邀请"
                        : action === "cancel"
                          ? "取消邀请"
                          : action === "remove"
                            ? "移除成员"
                            : action}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClearSelection}>
                  取消选择
                </Button>
                <Button
                  size="sm"
                  onClick={onExecuteBatch}
                  disabled={!batchOperation || batchLoading}
                  className="bg-primary hover:bg-primary/90"
                >
                  {batchLoading ? "执行中..." : "执行操作"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <VirtualTable<UserData>
        data={filteredUsers}
        columns={userTableColumns}
        height={containerHeight}
        itemHeight={itemHeight}
        loading={loading}
        emptyMessage="暂无用户数据"
      />

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  )
}
