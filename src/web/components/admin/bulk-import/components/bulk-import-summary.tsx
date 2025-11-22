'use client'

import type { ImportSummary } from '../types'

interface BulkImportSummaryProps {
  summary: ImportSummary
}

export function BulkImportSummary({ summary }: BulkImportSummaryProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-4">
      <p className="text-sm font-medium">导入结果</p>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>成功导入：{summary.success} 条</p>
        <p>导入失败：{summary.failed} 条</p>
        <p>如需重试，可修改失败条目或导出后另行处理。</p>
      </div>
    </div>
  )
}
