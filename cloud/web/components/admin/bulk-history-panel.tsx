'use client'

import type { ReactNode } from "react"
import { Clock, RefreshCw, Inbox, UploadCloud } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BulkHistoryEntry } from "@/types/admin"

interface BulkHistoryPanelProps {
  entries: BulkHistoryEntry[]
  loading: boolean
  onRefresh: () => void
}

const operationLabels: Record<string, string> = {
  mother_import: "母号导入",
  mother_import_text: "母号纯文本导入",
  code_generate: "兑换码生成",
  code_bulk_action: "兑换码批量操作",
}

const operationIcons: Record<string, ReactNode> = {
  mother_import: <Inbox className="h-4 w-4" />,
  mother_import_text: <Inbox className="h-4 w-4" />,
  code_generate: <UploadCloud className="h-4 w-4" />,
  code_bulk_action: <UploadCloud className="h-4 w-4" />,
}

export function BulkHistoryPanel({ entries, loading, onRefresh }: BulkHistoryPanelProps) {
  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">批量操作历史</CardTitle>
          <CardDescription className="text-sm">最近的导入与批量操作记录，便于审计和排查问题。</CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={onRefresh} className="flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            正在加载历史记录...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/40 bg-background/40 px-6 py-12 text-center text-sm text-muted-foreground">
            暂无批量操作记录。
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="space-y-3">
            {entries.map((entry) => {
              const label = operationLabels[entry.operation_type] || entry.operation_type
              const icon = operationIcons[entry.operation_type] ?? <Inbox className="h-4 w-4" />
              const createdAt = entry.created_at ? new Date(entry.created_at) : null

              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-border/50 bg-background/40 p-4 transition hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {icon}
                      </span>
                      {label}
                    </div>
                    {createdAt && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {createdAt.toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">执行人：{entry.actor}</Badge>
                    <Badge variant="outline">总数：{entry.total_count ?? "-"}</Badge>
                    <Badge variant="outline" className="text-green-600 border-green-500/40">
                      成功：{entry.success_count ?? "-"}
                    </Badge>
                    <Badge variant="outline" className="text-red-600 border-red-500/40">
                      失败：{entry.failed_count ?? "-"}
                    </Badge>
                  </div>

                  {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                    <div className="mt-3 rounded-md border border-border/40 bg-background/40 p-3 text-xs leading-5 text-muted-foreground">
                      {Object.entries(entry.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-3">
                          <span className="font-medium text-foreground/80">{key}</span>
                          <span className="truncate text-right text-foreground">
                            {typeof value === "string" ? value : JSON.stringify(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
