import { Button } from "@/components/ui/button"

interface PaginationControlsProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  loading?: boolean
  pageSizeOptions?: number[]
}

export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  loading = false,
  pageSizeOptions = [20, 50, 100, 200],
}: PaginationControlsProps) {
  const totalPagesRaw = total > 0 ? Math.ceil(total / Math.max(pageSize, 1)) : 0
  const totalPages = Math.max(totalPagesRaw, 1)
  const currentPage = totalPagesRaw > 0 ? Math.min(Math.max(page, 1), totalPages) : 1
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = total === 0 ? 0 : Math.min(total, currentPage * pageSize)
  const hasPrev = totalPagesRaw > 0 && currentPage > 1
  const hasNext = totalPagesRaw > 0 && currentPage < totalPages

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-border/40 bg-card/30 backdrop-blur-sm rounded-lg px-3 py-3">
      <div className="text-xs sm:text-sm text-muted-foreground">
        {total > 0 ? `显示 ${start} – ${end} / 共 ${total} 条` : loading ? "数据加载中..." : "暂无数据"}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="text-xs sm:text-sm text-muted-foreground">每页</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value) || pageSize)}
          className="px-2 py-1 text-xs sm:text-sm rounded-md border border-border/60 bg-background/60"
          disabled={loading}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrev || loading}
          className="px-2 sm:px-3"
        >
          上一页
        </Button>
        <span className="text-xs sm:text-sm text-muted-foreground">
          {totalPagesRaw > 0 ? `${currentPage} / ${totalPagesRaw}` : "0 / 0"}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNext || loading}
          className="px-2 sm:px-3"
        >
          下一页
        </Button>
      </div>
    </div>
  )
}

