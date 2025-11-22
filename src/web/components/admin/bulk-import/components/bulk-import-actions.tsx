'use client'

import { CheckCircle2, FileJson, Loader2, RefreshCw, Upload as UploadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ImportStage } from '../types'

interface BulkImportActionsProps {
  stage: ImportStage
  loading: boolean
  hasEntries: boolean
  canImport: boolean
  onValidate: () => void
  onImport: () => void
  onReset: () => void
  failedCount: number
  onExportFailed?: () => void
}

export function BulkImportActions({
  stage,
  loading,
  hasEntries,
  canImport,
  onValidate,
  onImport,
  onReset,
  failedCount,
  onExportFailed,
}: BulkImportActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        onClick={onValidate}
        disabled={loading || !hasEntries}
        className="flex items-center gap-2"
      >
        {loading && stage !== 'completed' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            校验中...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            校验条目
          </>
        )}
      </Button>
      <Button
        variant="secondary"
        onClick={onImport}
        disabled={loading || !canImport}
        className="flex items-center gap-2"
      >
        {loading && stage === 'validated' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            导入中...
          </>
        ) : (
          <>
            <UploadIcon className="h-4 w-4" />
            执行导入
          </>
        )}
      </Button>
      <Button variant="outline" size="sm" onClick={onReset} className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4" />
        重置流程
      </Button>
      {failedCount > 0 && onExportFailed && (
        <Button
          variant="outline"
          size="sm"
          onClick={onExportFailed}
          className="flex items-center gap-2"
        >
          <FileJson className="h-4 w-4" />
          导出失败条目
        </Button>
      )}
    </div>
  )
}
