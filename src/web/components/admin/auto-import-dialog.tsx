'use client'

import React, { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle, AlertCircle, ExternalLink, RefreshCw } from "lucide-react"
import { useNotifications } from "@/components/notification-system"
import { useSuccessFlow } from "@/hooks/use-success-flow"
import { usersAdminRequest, poolAdminRequest } from "@/lib/api/admin-client"
import { listPoolGroups, type PoolGroup } from "@/lib/api/pool-groups"

interface AutoImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface DetectedInfo {
  hasCookie: boolean
  teamId?: string
  email?: string
  cookieStatus: 'valid' | 'invalid' | 'expired' | 'checking'
  message: string
}

type ImportMode = 'user' | 'pool'

export function AutoImportDialog({ open, onOpenChange, onSuccess }: AutoImportDialogProps) {
  const [detectedInfo, setDetectedInfo] = useState<DetectedInfo | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [mode, setMode] = useState<ImportMode>('user')
  const [poolGroups, setPoolGroups] = useState<PoolGroup[]>([])
  const [selectedPoolGroupId, setSelectedPoolGroupId] = useState<string>("")
  const [customGroupName, setCustomGroupName] = useState("")
  const [useAutoNaming, setUseAutoNaming] = useState(true)
  const [jobId, setJobId] = useState<number | null>(null)
  const notifications = useNotifications()
  const { succeed } = useSuccessFlow()

  // 加载号池组列表
  const loadPoolGroups = async () => {
    try {
      const { ok, data } = await listPoolGroups()
      if (ok && Array.isArray(data)) {
        setPoolGroups(data)
      }
    } catch (error) {
      console.error('Failed to load pool groups:', error)
    }
  }

  // 对话框打开时加载分组
  useEffect(() => {
    if (open) {
      loadPoolGroups()
    }
  }, [open])

  // 检测 ChatGPT 登录状态
  const detectLoginStatus = async () => {
    setDetectedInfo({
      hasCookie: false,
      cookieStatus: 'checking',
      message: '正在检测登录状态...'
    })

    try {
      // 检查当前页面是否有 ChatGPT 的 Cookie
      const cookies = document.cookie
      const sessionToken = cookies.match(/__Secure-next-auth\.session-token=([^;]+)/)?.[1]
      const oaiDid = cookies.match(/oai-did=([^;]+)/)?.[1]
      const accountId = cookies.match(/_account=([^;]+)/)?.[1]

      if (!sessionToken) {
        setDetectedInfo({
          hasCookie: false,
          cookieStatus: 'invalid',
          message: '未检测到有效的 ChatGPT 登录信息'
        })
        return
      }

      // 构建完整的 Cookie 字符串
      const fullCookie = `__Secure-next-auth.session-token=${sessionToken}; oai-did=${oaiDid || ''}; _account=${accountId || ''}`

      // 调用后端 API 导入/入队
      const payload: any = {
        cookie: fullCookie,
        mode,
        pool_group_id: mode === 'pool' && selectedPoolGroupId ? parseInt(selectedPoolGroupId) : undefined,
        rename_after_import: useAutoNaming,
      }
      const client = mode === 'pool' ? poolAdminRequest : usersAdminRequest
      const { ok, data, error } = await client<any>('/import-cookie', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (ok) {
        const account = data?.account_id as string | undefined
        const mail = data?.user_email as string | undefined
        const job = data?.job_id as number | undefined
        if (job) setJobId(job)
        setDetectedInfo({
          hasCookie: true,
          teamId: account || accountId,
          email: mail,
          cookieStatus: 'valid',
          message: mode === 'pool' ? (job ? `已提交号池同步任务（Job #${job}）` : '已接收导入请求') : '解析成功'
        })
        const successMsg = mode === 'pool'
          ? (job ? `已提交号池同步任务（Job #${job}）` : '已接收导入请求')
          : '解析成功'
        setImportResult({ success: true, message: successMsg })
        // 成功流：池化模式导航到“任务列表”，用户模式仅提示
        await succeed(
          { ok: true, data: { message: successMsg } } as any,
          () => ({
            title: '账号导入成功',
            message: successMsg,
            navigateTo: mode === 'pool' ? '/admin/(protected)/jobs' : undefined,
          }),
        )
        onSuccess()
        onOpenChange(false)
      } else {
        setDetectedInfo({
          hasCookie: true,
          teamId: accountId,
          cookieStatus: 'expired',
          message: error || '导入失败'
        })
        setImportResult({
          success: false,
          message: error || '导入失败'
        })
      }
    } catch (error) {
      setDetectedInfo({
        hasCookie: false,
        cookieStatus: 'invalid',
        message: `检测失败：${error instanceof Error ? error.message : '未知错误'}`
      })
    }
  }

  // 一键导入
  const handleAutoImport = async () => {
    if (!detectedInfo?.hasCookie) {
      await detectLoginStatus()
      return
    }

    if (importResult?.success) {
      // 已经导入成功，关闭对话框
      onOpenChange(false)
      return
    }

    setImporting(true)
    try {
      await detectLoginStatus()
    } finally {
      setImporting(false)
    }
  }

  // 重置状态
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setDetectedInfo(null)
      setImportResult(null)
      setImporting(false)
      setSelectedPoolGroupId("")
      setCustomGroupName("")
      setUseAutoNaming(true)
    }
    onOpenChange(newOpen)
  }

  const getStatusIcon = () => {
    if (!detectedInfo) return null
    if (detectedInfo.cookieStatus === 'checking') {
      return <Loader2 className="w-4 h-4 animate-spin" />
    }
    if (detectedInfo.cookieStatus === 'valid' || importResult?.success) {
      return <CheckCircle className="w-4 h-4 text-green-500" />
    }
    return <AlertCircle className="w-4 h-4 text-red-500" />
  }

  const getStatusBadge = () => {
    if (!detectedInfo) return null
    const variants = {
      checking: { variant: "secondary" as const, text: "检测中" },
      valid: { variant: "default" as const, text: "有效" },
      invalid: { variant: "destructive" as const, text: "无效" },
      expired: { variant: "destructive" as const, text: "已过期" }
    }
    const config = variants[detectedInfo.cookieStatus]
    return <Badge variant={config.variant}>{config.text}</Badge>
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🚀 ChatGPT 一键录入
          </DialogTitle>
          <DialogDescription>
            在同一浏览器中登录 ChatGPT 后，点击按钮自动录入账号信息
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 使用说明 */}
          <Alert>
            <ExternalLink className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p><strong>使用步骤：</strong></p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>在新标签页登录 <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ChatGPT</a></li>
                  <li>进入你的团队管理页面（如：chatgpt.com/admin/members）</li>
                  <li>回到本页面，点击下面的"一键录入"按钮</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>

          {/* 检测结果 */}
          {detectedInfo && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <span className="font-medium">检测状态</span>
                </div>
                {getStatusBadge()}
              </div>

              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">团队ID：</span>
                  <span className="font-mono">{detectedInfo.teamId || '未获取到'}</span>
                </div>
                {detectedInfo.email && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">邮箱：</span>
                    <span>{detectedInfo.email}</span>
                  </div>
                )}
              </div>

              <Alert>
                <AlertDescription className="text-sm">
                  {detectedInfo.message}
                </AlertDescription>
              </Alert>

              {/* 导入模式与分组设置 */}
              {detectedInfo?.hasCookie && !importResult?.success && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium">导入设置</h4>

                  {/* 模式选择 */}
                  <div className="space-y-2">
                    <Label htmlFor="mode-select">导入模式</Label>
                    <Select value={mode} onValueChange={(v) => setMode(v as ImportMode)}>
                      <SelectTrigger id="mode-select">
                        <SelectValue placeholder="选择导入模式" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">用户组（只解析，不入队）</SelectItem>
                        <SelectItem value="pool">号池组（创建母号并入队同步）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {mode === 'pool' && (
                    <div className="space-y-2">
                      <Label htmlFor="pool-group-select">号池组</Label>
                      <Select value={selectedPoolGroupId} onValueChange={setSelectedPoolGroupId}>
                        <SelectTrigger id="pool-group-select">
                          <SelectValue placeholder="选择号池组" />
                        </SelectTrigger>
                        <SelectContent>
                          {poolGroups.map((group) => (
                            <SelectItem key={group.id} value={group.id.toString()}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* 自定义名称 */}
                  <div className="space-y-2">
                    <Label htmlFor="custom-name">自定义母号名称（可选）</Label>
                    <Input
                      id="custom-name"
                      placeholder="留空使用邮箱作为名称"
                      value={customGroupName}
                      onChange={(e) => setCustomGroupName(e.target.value)}
                    />
                  </div>

                  {/* 自动命名开关（仅池化模式下影响异步同步任务行为） */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="auto-naming"
                      checked={useAutoNaming}
                      onChange={(e) => setUseAutoNaming(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="auto-naming" className="text-sm">
                      自动应用Team命名规则
                    </Label>
                  </div>
                  {mode === 'pool' && selectedPoolGroupId && (
                    <div className="text-xs text-muted-foreground">将按号池组规则进行命名与同步</div>
                  )}
                </div>
              )}

              {/* 导入结果 */}
              {importResult && (
                <Alert className={importResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                  <AlertDescription className="text-sm">
                    {importResult.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={importing}
          >
            关闭
          </Button>

          <Button
            onClick={handleAutoImport}
            disabled={importing || (importResult?.success === true)}
            className="min-w-[120px]"
          >
            {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {!detectedInfo && "一键录入"}
            {detectedInfo && !importResult?.success && "重新检测"}
            {importResult?.success && "✅ 已录入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
