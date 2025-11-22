import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, RefreshCw } from "lucide-react"
import type { StatsData } from "@/store/admin-context"
import type { ServiceStatus } from "@/store/admin-context"
import type { AuditLog } from "@/store/admin-context"

interface OverviewSectionProps {
  serviceStatus: ServiceStatus
  autoRefresh: boolean
  stats: StatsData | null
  statsLoading: boolean
  onRefreshStats: () => void
  onNavigateToCodesStatus: () => void
  onNavigateToAudit: () => void
  remainingQuota: number | null
  maxCodeCapacity: number | null
  activeCodesCount: number | null
  quickStats: {
    todayRedemptions: number
    todayInvites: number
    avgResponseTime: number
    successRate: number
  }
  auditLoading: boolean
  auditLogs: AuditLog[]
}

export function OverviewSection({
  serviceStatus,
  autoRefresh,
  stats,
  statsLoading,
  onRefreshStats,
  onNavigateToCodesStatus,
  onNavigateToAudit,
  remainingQuota,
  maxCodeCapacity,
  activeCodesCount,
  quickStats,
  auditLoading,
  auditLogs,
}: OverviewSectionProps) {
  return (
    <div className="space-y-4">
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            系统状态
          </CardTitle>
          <CardDescription>后端运行情况与关键指标</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">后端服务</p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    serviceStatus.backend === "online"
                      ? "bg-green-500 animate-pulse"
                      : serviceStatus.backend === "offline"
                        ? "bg-red-500"
                        : "bg-yellow-500 animate-pulse"
                  }`}
                />
                <span className="font-medium">
                  {serviceStatus.backend === "online"
                    ? "在线"
                    : serviceStatus.backend === "offline"
                      ? "离线"
                      : "检查中"}
                </span>
              </div>
              {serviceStatus.lastCheck && (
                <p className="mt-1 text-xs text-muted-foreground">
                  最近检查：{serviceStatus.lastCheck.toLocaleString()}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">自动刷新</p>
              <div className="mt-1 font-medium">{autoRefresh ? "已开启" : "已关闭"}</div>
              <p className="mt-1 text-xs text-muted-foreground">可在顶部切换自动刷新</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">待处理邀请</p>
              <div className="mt-1 font-medium text-lg">{stats?.pending_invites ?? 0}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                成功/失败：{stats?.successful_invites ?? 0} / {stats?.status_breakdown?.failed ?? 0}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRefreshStats} disabled={statsLoading} className="bg-transparent">
              <RefreshCw className={`w-4 h-4 mr-2 ${statsLoading ? "animate-spin" : ""}`} />
              刷新统计
            </Button>
            <Button variant="outline" size="sm" onClick={onNavigateToCodesStatus}>
              查看限流仪表板
            </Button>
            <Button variant="outline" size="sm" onClick={onNavigateToAudit}>
              查看审计日志
            </Button>
          </div>
        </CardContent>
      </Card>

      {stats && (
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>核心指标</CardTitle>
            <CardDescription>邀请与兑换码整体情况</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-border/40 bg-background/40">
                <p className="text-sm text-muted-foreground">总兑换码</p>
                <p className="text-2xl font-semibold mt-1">{stats.total_codes}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  已使用 {stats.used_codes} (
                  {stats.total_codes > 0 ? ((stats.used_codes / stats.total_codes) * 100).toFixed(1) : 0}%)
                </p>
              </div>
              <div className="p-4 rounded-lg border border-border/40 bg-background/40">
                <p className="text-sm text-muted-foreground">活跃团队</p>
                <p className="text-2xl font-semibold mt-1">{stats.active_teams}</p>
                <p className="text-xs text-muted-foreground mt-1">母号数量 {stats.mother_usage.length}</p>
              </div>
              <div className="p-4 rounded-lg border border-border/40 bg-background/40">
                <p className="text-sm text-muted-foreground">可用额度</p>
                <p className="text-2xl font-semibold mt-1">{remainingQuota ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  最大容量 {maxCodeCapacity ?? stats.max_code_capacity ?? 0} · 活跃兑换码{" "}
                  {activeCodesCount ?? stats.active_codes ?? 0}
                </p>
              </div>
              <div className="p-4 rounded-lg border border-border/40 bg-background/40">
                <p className="text-sm text-muted-foreground">今日邀请</p>
                <p className="text-2xl font-semibold mt-1">{quickStats.todayInvites}</p>
                <p className="text-xs text-muted-foreground mt-1">今日兑换 {quickStats.todayRedemptions ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>最近审计事件</CardTitle>
            <CardDescription>显示最近 5 条管理员操作</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onNavigateToAudit}>
            查看全部
          </Button>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-10 rounded bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无审计记录</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="p-3 rounded-lg border border-border/40 bg-background/40">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{log.actor}</span>
                    <span className="text-muted-foreground">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : "-"}
                    </span>
                  </div>
                  <p className="text-sm mt-1 text-foreground">
                    {log.action}
                    {log.target_type && ` · ${log.target_type}`}
                    {log.target_id && ` #${log.target_id}`}
                  </p>
                  {log.payload_redacted && (
                    <p className="mt-1 text-xs text-muted-foreground">{log.payload_redacted}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
