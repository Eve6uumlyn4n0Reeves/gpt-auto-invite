import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Activity, Database, FileInput, KeyRound, Power, RefreshCw, RotateCcw } from "lucide-react"
import type { ImportCookieResult, PerformanceStatsResponse } from "@/types/admin"
import { adminRequest } from "@/lib/api/admin-client"

type DbStatus = {
  ok: boolean
  url: string | null
  dialect: string | null
  alembic_version: string | null
  error?: string | null
}

type DbStatusResponse = {
  users: DbStatus
  pool: DbStatus
}

interface SettingsSectionProps {
  changePasswordForm: {
    oldPassword: string
    newPassword: string
    confirmPassword: string
  }
  changePasswordError: string | null
  changePasswordLoading: boolean
  onChangePasswordSubmit: (event: FormEvent<HTMLFormElement>) => void
  onChangePasswordField: (field: "oldPassword" | "newPassword" | "confirmPassword", value: string) => void
  importCookieInput: string
  importCookieError: string | null
  importCookieLoading: boolean
  importCookieResult: ImportCookieResult | null
  onImportCookieInputChange: (value: string) => void
  onImportCookieClear: () => void
  onImportCookieSubmit: () => void
  logoutAllLoading: boolean
  onLogoutAll: () => void
  performanceLoading: boolean
  performanceError: string | null
  performanceStats: PerformanceStatsResponse | null
  onRefreshPerformance: () => void
  onTogglePerformance: () => void
  onResetPerformance: () => void
}

export function SettingsSection({
  changePasswordForm,
  changePasswordError,
  changePasswordLoading,
  onChangePasswordSubmit,
  onChangePasswordField,
  importCookieInput,
  importCookieError,
  importCookieLoading,
  importCookieResult,
  onImportCookieInputChange,
  onImportCookieClear,
  onImportCookieSubmit,
  logoutAllLoading,
  onLogoutAll,
  performanceLoading,
  performanceError,
  performanceStats,
  onRefreshPerformance,
  onTogglePerformance,
  onResetPerformance,
}: SettingsSectionProps) {
  const [dbStatus, setDbStatus] = useState<DbStatusResponse | null>(null)
  const [dbStatusLoading, setDbStatusLoading] = useState(false)
  const [dbStatusError, setDbStatusError] = useState<string | null>(null)

  const loadDbStatus = useCallback(async () => {
    setDbStatusLoading(true)
    setDbStatusError(null)
    try {
      const { ok, data, error } = await adminRequest<DbStatusResponse>("/db-status")
      if (!ok) throw new Error(error)
      setDbStatus(data)
    } catch (e) {
      setDbStatusError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setDbStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDbStatus()
  }, [loadDbStatus])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              数据库状态
            </CardTitle>
            <CardDescription>双库连接与迁移版本检查</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadDbStatus} disabled={dbStatusLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${dbStatusLoading ? "animate-spin" : ""}`} /> 刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {dbStatusError && (
            <Alert className="border-red-500/50 bg-red-500/10">
              <AlertDescription className="text-red-600">{dbStatusError}</AlertDescription>
            </Alert>
          )}
          {dbStatusLoading && (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />
              ))}
            </div>
          )}
          {dbStatus && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[{ key: "users", label: "Users 库" }, { key: "pool", label: "Pool 库" }].map(({ key, label }) => {
                const s = (dbStatus as any)[key] as DbStatus
                const ok = s?.ok
                return (
                  <div key={key} className="rounded-md border border-border/40 p-3 bg-background/40">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{label}</div>
                      <div className={`text-xs ${ok ? "text-green-600" : "text-red-600"}`}>{ok ? "OK" : "ERROR"}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground break-all">
                      <div>Dialect：{s?.dialect || "?"}</div>
                      <div>URL：{s?.url || "?"}</div>
                      <div>Alembic：{s?.alembic_version || "(未知或未初始化)"}</div>
                      {s?.error && <div className="text-red-600">错误：{s.error}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            修改管理员密码
          </CardTitle>
          <CardDescription>更新默认管理员密码，建议定期轮换</CardDescription>
        </CardHeader>
        <CardContent>
          {changePasswordError && (
            <Alert className="mb-4 border-red-500/50 bg-red-500/10">
              <AlertDescription className="text-red-600">{changePasswordError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={onChangePasswordSubmit} className="space-y-3">
            <div>
              <Label htmlFor="oldPassword">旧密码</Label>
              <Input
                id="oldPassword"
                type="password"
                value={changePasswordForm.oldPassword}
                onChange={(event) => onChangePasswordField("oldPassword", event.target.value)}
                required
                className="mt-1 bg-background/50 border-border/60"
              />
            </div>
            <div>
              <Label htmlFor="newPassword">新密码</Label>
              <Input
                id="newPassword"
                type="password"
                value={changePasswordForm.newPassword}
                onChange={(event) => onChangePasswordField("newPassword", event.target.value)}
                required
                className="mt-1 bg-background/50 border-border/60"
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={changePasswordForm.confirmPassword}
                onChange={(event) => onChangePasswordField("confirmPassword", event.target.value)}
                required
                className="mt-1 bg-background/50 border-border/60"
              />
            </div>
            <Button type="submit" disabled={changePasswordLoading} className="w-full">
              {changePasswordLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  更新中...
                </>
              ) : (
                "更新密码"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileInput className="w-5 h-5 text-primary" />
            从 Cookie 提取访问令牌
          </CardTitle>
          <CardDescription>粘贴 ChatGPT 企业后台 Cookie，快速生成母号令牌</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {importCookieError && (
            <Alert className="border-red-500/50 bg-red-500/10">
              <AlertDescription className="text-red-600">{importCookieError}</AlertDescription>
            </Alert>
          )}
          <Textarea
            value={importCookieInput}
            onChange={(event) => onImportCookieInputChange(event.target.value)}
            placeholder="__Secure-next-auth.session-token=..."
            className="min-h-[120px] bg-background/50 border-border/60"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onImportCookieClear}>
              清空
            </Button>
            <Button size="sm" onClick={onImportCookieSubmit} disabled={importCookieLoading}>
              {importCookieLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  解析中...
                </>
              ) : (
                "生成访问令牌"
              )}
            </Button>
          </div>
          {importCookieResult && (
            <div className="rounded-lg border border-border/40 bg-background/40 p-3 text-sm space-y-1">
              <div>邮箱：{importCookieResult.user_email || "未知"}</div>
              <div>账号 ID：{importCookieResult.account_id || "未知"}</div>
              <div>过期时间：{importCookieResult.token_expires_at || "未知"}</div>
              <div className="text-xs text-muted-foreground">已自动填充到“新增母号”表单，可直接保存。</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="w-5 h-5 text-primary" />
            会话管理
          </CardTitle>
          <CardDescription>立即撤销所有管理员会话，强制重新登录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            如果怀疑管理员密码泄露，可立即撤销所有会话，确保只有新密码持有人可以再次登录。
          </p>
          <Button variant="destructive" onClick={onLogoutAll} disabled={logoutAllLoading}>
            {logoutAllLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                正在撤销...
              </>
            ) : (
              "撤销全部会话"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/50 backdrop-blur-sm lg:col-span-2">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              数据库性能监控
            </CardTitle>
            <CardDescription>查询统计与慢查询追踪</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRefreshPerformance} disabled={performanceLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${performanceLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button variant="outline" size="sm" onClick={onTogglePerformance}>
              {performanceStats?.enabled ? "关闭监控" : "开启监控"}
            </Button>
            <Button variant="outline" size="sm" onClick={onResetPerformance}>
              <RotateCcw className="w-4 h-4 mr-2" />
              重置
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {performanceError && (
            <Alert className="border-red-500/50 bg-red-500/10">
              <AlertDescription className="text-red-600">{performanceError}</AlertDescription>
            </Alert>
          )}
          {performanceLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-10 rounded bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : performanceStats ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span>监控状态：</span>
                <span className={`font-medium ${performanceStats.enabled ? "text-green-600" : "text-muted-foreground"}`}>
                  {performanceStats.enabled ? "运行中" : "已关闭"}
                </span>
                <span className="ml-4 text-muted-foreground">累积操作：{performanceStats.total_operations}</span>
              </div>
              {performanceStats.operations && Object.keys(performanceStats.operations).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">热点操作</p>
                  <div className="space-y-2">
                    {Object.entries(performanceStats.operations)
                      .slice(0, 5)
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between text-sm border border-border/30 rounded-md px-3 py-2 bg-background/40"
                        >
                          <span className="font-medium truncate pr-3">{key}</span>
                          <span className="text-muted-foreground">
                            次数：{value?.count ?? 0}，平均{" "}
                            {typeof value?.avg_time_ms === "number"
                              ? value.avg_time_ms.toFixed(1)
                              : value?.avg_time_ms ?? 0}{" "}
                            ms
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {performanceStats.slow_queries?.length ? (
                <div>
                  <p className="text-sm font-medium mb-2">慢查询</p>
                  <div className="space-y-2">
                    {performanceStats.slow_queries.slice(0, 5).map((item, index) => (
                      <div key={index} className="border border-border/30 rounded-md px-3 py-2 bg-background/40 text-sm">
                        <div className="text-muted-foreground">
                          {item.duration_ms} ms · {item.last_executed_at ? new Date(item.last_executed_at).toLocaleString() : "未知时间"}
                        </div>
                        <div className="mt-1 font-mono text-xs break-all text-foreground">{item.query}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂无慢查询记录</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">性能监控数据不可用</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/40 bg-card/50 backdrop-blur-sm lg:col-span-2">
        <CardHeader>
          <CardTitle>远程录号（Ingest API）</CardTitle>
          <CardDescription>
            可在云端启用 Ingest API（HMAC 签名 + 限流）后，由 GUI 或受信任服务直接录入母号；详见文档。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="mb-2">启用：设置环境变量 <code>INGEST_API_ENABLED=true</code> 与 <code>INGEST_API_KEY</code>。</p>
          <p className="mb-2">接口：<code>POST /api/ingest/mothers</code>，签名头：<code>X-Ingest-Ts</code> / <code>X-Ingest-Sign</code>。</p>
          <a
            className="underline text-primary"
            href="/docs/API.md#ingest-api"
            target="_blank"
            rel="noreferrer"
          >查看 Ingest API 文档</a>
        </CardContent>
      </Card>
    </div>
  )
}
