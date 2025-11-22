import { Alert, AlertDescription } from "@/components/ui/alert"
import { BulkHistoryPanel } from "@/components/admin/bulk-history-panel"
import { PaginationControls } from "@/components/admin/pagination-controls"
import type { BulkHistoryEntry } from "@/types/admin"

interface BulkHistorySectionProps {
  entries: BulkHistoryEntry[]
  loading: boolean
  error?: string | null
  page: number
  pageSize: number
  total: number
  onRefresh: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function BulkHistorySection({
  entries,
  loading,
  error,
  page,
  pageSize,
  total,
  onRefresh,
  onPageChange,
  onPageSizeChange,
}: BulkHistorySectionProps) {
  return (
    <div className="space-y-4">
      {error && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertDescription className="text-red-600 text-sm">{error}</AlertDescription>
        </Alert>
      )}
      <BulkHistoryPanel entries={entries} loading={loading} onRefresh={onRefresh} />
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

