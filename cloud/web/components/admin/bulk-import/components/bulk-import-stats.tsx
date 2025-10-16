'use client'

import { Card } from '@/components/ui/card'

interface BulkImportStatsProps {
  total: number
  validCount: number
  invalidCount: number
  duplicateNames: number
  duplicateTokens: number
  showDuplicatesNotice: boolean
}

export function BulkImportStats({
  total,
  validCount,
  invalidCount,
  duplicateNames,
  duplicateTokens,
  showDuplicatesNotice,
}: BulkImportStatsProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatItem label="条目总数" value={total} />
        <StatItem label="待导入" value={validCount} valueClassName="text-primary" />
        <StatItem label="校验未通过" value={invalidCount} valueClassName="text-yellow-500" />
        <StatItem
          label="检测到重复"
          value={duplicateNames + duplicateTokens}
          valueClassName="text-orange-500"
        />
      </div>

      {showDuplicatesNotice && (
        <div className="mt-3 rounded-md border border-orange-400/40 bg-orange-400/10 p-3 text-xs text-orange-700">
          <p className="font-medium">检测到重复项：</p>
          {duplicateNames > 0 && <p>• 重复邮箱：{duplicateNames} 组</p>}
          {duplicateTokens > 0 && <p>• 重复 Access Token：{duplicateTokens} 组</p>}
          <p>请在校验前确认是否需要合并或删除重复条目。</p>
        </div>
      )}
    </div>
  )
}

interface StatItemProps {
  label: string
  value: number
  valueClassName?: string
}

function StatItem({ label, value, valueClassName }: StatItemProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${valueClassName ?? ''}`}>{value}</p>
    </div>
  )
}
