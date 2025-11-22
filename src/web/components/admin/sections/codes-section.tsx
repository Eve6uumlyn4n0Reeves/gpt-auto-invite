import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PaginationControls } from "@/components/admin/pagination-controls"
import { VirtualTable, type VirtualTableColumn } from "@/components/virtual-table"
import type { CodeData } from "@/store/admin-context"
import type { CodeSkuSummary } from "@/shared/api-types"

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
  codeLifecyclePlan: 'weekly' | 'monthly'
  onLifecyclePlanChange: (plan: 'weekly' | 'monthly') => void
  codeSwitchLimit: number
  onSwitchLimitChange: (value: number) => void
  generateLoading: boolean
  codeSkus: CodeSkuSummary[]
  selectedSkuSlug: string
  onSkuChange: (slug: string) => void
  skuLoading: boolean
  remainingQuota: number | null
  maxCodeCapacity: number | null
  activeCodesCount: number | null
  capacityWarn: boolean
  aliveMothers: number | null
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
  codeLifecyclePlan,
  onLifecyclePlanChange,
  codeSwitchLimit,
  onSwitchLimitChange,
  generateLoading,
  codeSkus,
  selectedSkuSlug,
  onSkuChange,
  skuLoading,
  remainingQuota,
  maxCodeCapacity,
  activeCodesCount,
  capacityWarn,
  aliveMothers,
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
            <div className="sm:col-span-2">
              <Label htmlFor="codeSku">兑换码商品</Label>
              <select
                id="codeSku"
                value={selectedSkuSlug}
                onChange={(event) => onSkuChange(event.target.value)}
                className="mt-1 block w-full rounded-md border border-border/60 bg-background/50 px-3 py-2 text-sm"
                disabled={generateLoading || skuLoading || codeSkus.length === 0}
              >
                {codeSkus.length === 0 && <option value="">暂无可用商品</option>}
                {codeSkus.map((sku) => (
                  <option key={sku.id} value={sku.slug} disabled={!sku.is_active}>
                    {sku.name}（{sku.lifecycle_days} 天
                    {sku.default_refresh_limit === null || sku.default_refresh_limit === undefined
                      ? ' · 刷新不限'
                      : ` · 刷新${sku.default_refresh_limit}次`}
                    ）{!sku.is_active ? ' · 已停用' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {skuLoading
                  ? '正在同步商品配置...'
                  : selectedSkuSlug
                  ? codeSkus.find((sku) => sku.slug === selectedSkuSlug)?.description || '默认兑换码商品配置。'
                  : '请选择可用的兑换码商品类型。'}
              </p>
            </div>
            <div>
              <Label htmlFor="codeLifecyclePlan">生命周期</Label>
              <select
                id="codeLifecyclePlan"
                value={codeLifecyclePlan}
                onChange={(event) => onLifecyclePlanChange(event.target.value as 'weekly' | 'monthly')}
                className="mt-1 block w-full rounded-md border border-border/60 bg-background/50 px-3 py-2 text-sm"
                disabled={generateLoading}
              >
                <option value="weekly">7 天（周）</option>
                <option value="monthly">30 天（月）</option>
              </select>
            </div>
            <div>
              <Label htmlFor="codeSwitchLimit">切换次数上限</Label>
              <Input
                id="codeSwitchLimit"
                type="number"
                min="1"
                max="100"
                value={codeSwitchLimit}
                onChange={(event) => onSwitchLimitChange(Math.max(1, Math.min(Number(event.target.value) || 1, 100)))}
                className="bg-background/50 border-border/60"
                disabled={generateLoading}
              />
              <p className="mt-1 text-xs text-muted-foreground">初次兑换不计入切换次数。</p>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
            <p>当前已启用配额：{maxCodeCapacity ?? "未知"}（席位） · 活跃兑换码：{activeCodesCount ?? "未知"}</p>
            <p>健康母号数量：{aliveMothers ?? '未知'}</p>
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
            {capacityWarn && (
              <p className="text-xs text-red-600">
                ⚠️ 号池余量接近上限，请及时新增母号或暂停发码，避免超发。
              </p>
            )}
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
          codeSwitchLimit < 1 ||
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
