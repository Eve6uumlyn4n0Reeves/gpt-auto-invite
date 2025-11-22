import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { PaginationControls } from "@/components/admin/pagination-controls"
import { RefreshCw } from "lucide-react"
import type { AuditLog } from "@/store/admin-context"

interface AuditSectionProps {
  loading: boolean
  error?: string | null
  logs: AuditLog[]
  page: number
  pageSize: number
  total: number
  onRefresh: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function AuditSection({
  loading,
  error,
  logs,
  page,
  pageSize,
  total,
  onRefresh,
  onPageChange,
  onPageSizeChange,
}: AuditSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">审计日志</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </div>
      {error && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertDescription className="text-red-600">{error}</AlertDescription>
        </Alert>
      )}
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardContent className="space-y-3 pt-6">
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-12 rounded bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无审计记录</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="border border-border/40 rounded-lg p-3 hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{log.actor}</span>
                  <span className="text-muted-foreground">
                    {log.created_at ? new Date(log.created_at).toLocaleString() : "-"}
                  </span>
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {log.action}
                  {log.target_type && ` · ${log.target_type}`}
                  {log.target_id && ` #${log.target_id}`}
                </div>
                {log.payload_redacted && (
                  <div className="mt-1 text-xs text-muted-foreground">{log.payload_redacted}</div>
                )}
                <div className="mt-1 text-xs text-muted-foreground">
                  {log.ip && <span>IP: {log.ip} </span>}
                  {log.ua && <span>UA: {log.ua}</span>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
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
