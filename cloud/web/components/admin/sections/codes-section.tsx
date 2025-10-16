import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PaginationControls } from "@/components/admin/pagination-controls"
import { VirtualTable, type VirtualTableColumn } from "@/components/virtual-table"
import type { CodeData } from "@/store/admin-context"

export type CodeTableColumn = VirtualTableColumn<CodeData>

interface CodesSectionProps {
  loading: boolean
  filteredCodes: CodeData[]
  codeTableColumns: CodeTableColumn[]
  containerHeight: number
  itemHeight: number
  selectedCodes: number[]
  batchOperation: string
  supportedBatchActions: string[]
  batchLoading: boolean
  onClearCache: () => void
  onRefresh: () => void
  onBatchOperationChange: (value: string) => void
  onClearSelection: () => void
  onExecuteBatch: () => void
  onCodeCountInput: (value: string) => void
  codeCount: number
  codePrefix: string
  onCodePrefixChange: (value: string) => void
  generateLoading: boolean
  remainingQuota: number | null
  maxCodeCapacity: number | null
  activeCodesCount: number | null
  quotaLoading: boolean
  quotaError: string | null
  onGenerateCodes: () => void
  onRowAction: (code: CodeData) => void
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function CodesSection({
  loading,
  filteredCodes,
  codeTableColumns,
  containerHeight,
  itemHeight,
  selectedCodes,
  batchOperation,
  supportedBatchActions,
  batchLoading,
  onClearCache,
  onRefresh,
  onBatchOperationChange,
  onClearSelection,
  onExecuteBatch,
  onCodeCountInput,
  codeCount,
  codePrefix,
  onCodePrefixChange,
  generateLoading,
  remainingQuota,
  maxCodeCapacity,
  activeCodesCount,
  quotaLoading,
  quotaError,
  onGenerateCodes,
  onRowAction,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: CodesSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">兑换码管理</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClearCache} className="flex">
            清除缓存
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="flex">
            刷新
          </Button>
        </div>
      </div>

      {selectedCodes.length > 0 && (
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">已选择 {selectedCodes.length} 个兑换码</span>
                <select
                  value={batchOperation}
                  onChange={(event) => onBatchOperationChange(event.target.value)}
                  className="px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm"
                >
                  <option value="">选择操作</option>
                  {supportedBatchActions.map((action) => (
                    <option key={action} value={action}>
                      {action === "disable" ? "禁用兑换码" : action}
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

      <Card id="generate-codes-section" className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">生成兑换码</CardTitle>
          <CardDescription>批量生成新的兑换码</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="codeCount">生成数量</Label>
              <Input
                id="codeCount"
                type="number"
                min="1"
                max="1000"
                value={codeCount}
                onChange={(event) => onCodeCountInput(event.target.value)}
                className="bg-background/50 border-border/60"
                disabled={generateLoading}
              />
            </div>
            <div>
              <Label htmlFor="codePrefix">前缀（可选）</Label>
              <Input
                id="codePrefix"
                type="text"
                placeholder="如：TEAM2024"
                value={codePrefix}
                onChange={(event) => onCodePrefixChange(event.target.value)}
                className="bg-background/50 border-border/60"
                disabled={generateLoading}
                maxLength={10}
              />
            </div>
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
            <p>当前已启用配额：{maxCodeCapacity ?? "未知"}（席位） · 活跃兑换码：{activeCodesCount ?? "未知"}</p>
            <p>单次最多生成 1000 个兑换码。</p>
            <p>
              剩余可生成数量：
              {remainingQuota !== null ? (
                <span className={remainingQuota > 0 ? "text-foreground font-medium" : "text-red-600 font-medium"}>
                  {remainingQuota}
                </span>
              ) : (
                "计算中"
              )}
              {remainingQuota !== null && remainingQuota <= 0 && "（已用尽，可清理已使用或过期的兑换码后重试）"}
            </p>
            {quotaLoading && <p className="text-xs text-muted-foreground">正在同步配额...</p>}
            {quotaError && <p className="text-xs text-red-600">配额更新失败：{quotaError}</p>}
          </div>
          <Button
            id="btn-generate-codes"
            onClick={onGenerateCodes}
        disabled={
          generateLoading ||
          codeCount < 1 ||
          codeCount > 1000 ||
          (remainingQuota !== null && remainingQuota <= 0)
        }
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {generateLoading ? "生成中..." : `生成 ${codeCount} 个兑换码`}
          </Button>
        </CardContent>
      </Card>

      <VirtualTable<CodeData>
        data={filteredCodes}
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
    </div>
  )
}
