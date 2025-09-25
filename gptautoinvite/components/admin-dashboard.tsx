"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, RefreshCw } from "lucide-react"

interface AdminMeResponse {
  authenticated: boolean
}

interface MotherAccount {
  id: number
  name: string
  status: string
  seat_limit: number
  seats_used: number
  token_expires_at?: string
  notes?: string
  teams: Array<{
    team_id: string
    team_name?: string
    is_enabled: boolean
    is_default: boolean
  }>
}

interface UserData {
  id: number
  email: string
  status: string
  team_id?: string
  team_name?: string
  invited_at: string
  redeemed_at?: string
  code_used?: string
}

interface CodeData {
  id: number
  code: string
  batch_id?: string
  is_used: boolean
  expires_at?: string
  created_at: string
  used_by?: string
  used_at?: string
}

interface AuditLog {
  id: number
  actor: string
  action: string
  target_type?: string
  target_id?: string
  payload_redacted?: string
  ip?: string
  ua?: string
  created_at: string
}

interface StatsData {
  total_codes: number
  used_codes: number
  pending_invites: number
  successful_invites: number
  total_users: number
  active_teams: number
  usage_rate: number
  recent_activity: Array<{
    date: string
    invites: number
    redemptions: number
  }>
  status_breakdown: Record<string, number>
  mother_usage: Array<{
    id: number
    name: string
    seat_limit: number
    seats_used: number
    usage_rate: number
    status: string
  }>
  // Code capacity quota
  enabled_teams?: number
  max_code_capacity?: number
  active_codes?: number
  remaining_code_quota?: number
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  const [loginPassword, setLoginPassword] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [mothers, setMothers] = useState<MotherAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [serviceStatus, setServiceStatus] = useState<{
    backend: "online" | "offline" | "unknown"
    lastCheck: Date | null
  }>({
    backend: "unknown",
    lastCheck: null,
  })

  const [codeCount, setCodeCount] = useState(10)
  const [codePrefix, setCodePrefix] = useState("")
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([])
  const [generateLoading, setGenerateLoading] = useState(false)

  const [users, setUsers] = useState<UserData[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  const [codes, setCodes] = useState<CodeData[]>([])
  const [codesLoading, setCodesLoading] = useState(false)

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const [stats, setStats] = useState<StatsData | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // 编辑母账号相关状态
  const [editingMother, setEditingMother] = useState<MotherAccount | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const [selectedUsers, setSelectedUsers] = useState<number[]>([])
  const [selectedCodes, setSelectedCodes] = useState<number[]>([])
  const [batchOperation, setBatchOperation] = useState<string>("")
  const [batchLoading, setBatchLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/admin/me")
      const data: AdminMeResponse = await response.json()
      setAuthenticated(data.authenticated)

      if (data.authenticated) {
        loadMothers()
        loadStats()
      }
    } catch (error) {
      console.error("Auth check error:", error)
      setAuthenticated(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginPassword.trim()) return

    setLoginLoading(true)
    setLoginError("")

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: loginPassword,
        }),
      })

      if (response.ok) {
        setAuthenticated(true)
        setLoginPassword("")
        loadMothers()
        loadStats()
      } else {
        setLoginError("密码错误")
      }
    } catch (error) {
      setLoginError("登录失败，请稍后重试")
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" })
      setAuthenticated(false)
      setMothers([])
      setUsers([])
      setCodes([])
      setAuditLogs([])
      setStats(null)
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  const loadMothers = async () => {
    setLoading(true)
    setError("") // Clear previous errors
    try {
      const response = await fetch("/api/admin/mothers")
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          const validatedMothers = data.map((mother) => ({
            ...mother,
            seat_limit: Math.min(mother.seat_limit || 7, 7), // Enforce max 7 seats
          }))
          setMothers(validatedMothers)
          setServiceStatus({
            backend: "online",
            lastCheck: new Date(),
          })
        } else {
          setMothers([])
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: "服务不可用" }))
        if (response.status === 503) {
          setError("后端服务暂时不可用，请稍后重试")
          setServiceStatus({
            backend: "offline",
            lastCheck: new Date(),
          })
        } else if (response.status === 502) {
          setError("后端服务连接失败，请检查服务状态")
          setServiceStatus({
            backend: "offline",
            lastCheck: new Date(),
          })
        } else {
          setError(errorData.message || "加载母账号失败")
        }
        setMothers([]) // Clear mothers data on error
      }
    } catch (error) {
      console.error("Load mothers error:", error)
      setError("网络连接失败，请检查网络连接")
      setMothers([]) // Clear mothers data on network error
      setServiceStatus({
        backend: "offline",
        lastCheck: new Date(),
      })
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const response = await fetch("/api/admin/users")
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      } else {
        setError("加载用户数据失败")
      }
    } catch (error) {
      setError("加载用户数据失败")
    } finally {
      setUsersLoading(false)
    }
  }

  const loadCodes = async () => {
    setCodesLoading(true)
    try {
      const response = await fetch("/api/admin/codes")
      if (response.ok) {
        const data = await response.json()
        setCodes(data)
      } else {
        setError("加载兑换码数据失败")
      }
    } catch (error) {
      setError("加载兑换码数据失败")
    } finally {
      setCodesLoading(false)
    }
  }

  const loadAuditLogs = async () => {
    setAuditLoading(true)
    try {
      const response = await fetch("/api/admin/audit-logs")
      if (response.ok) {
        const data = await response.json()
        setAuditLogs(data)
      } else {
        setError("加载审计日志失败")
      }
    } catch (error) {
      setError("加载审计日志失败")
    } finally {
      setAuditLoading(false)
    }
  }

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      const response = await fetch("/api/admin/stats")
      if (response.ok) {
        const data = await response.json()
        setStats(data)
        setServiceStatus({
          backend: "online",
          lastCheck: new Date(),
        })
      } else {
        const errorData = await response.json().catch(() => ({ message: "服务不可用" }))
        if (response.status === 503) {
          console.error("后端服务暂时不可用")
          setStats(null) // Clear stats on service unavailable
          setServiceStatus({
            backend: "offline",
            lastCheck: new Date(),
          })
        } else if (response.status === 502) {
          console.error("后端服务连接失败")
          setStats(null) // Clear stats on backend error
          setServiceStatus({
            backend: "offline",
            lastCheck: new Date(),
          })
        } else {
          console.error("加载统计数据失败:", errorData.message)
          setStats(null)
        }
      }
    } catch (error) {
      console.error("Load stats error:", error)
      setStats(null) // Clear stats on network error
      setServiceStatus({
        backend: "offline",
        lastCheck: new Date(),
      })
    } finally {
      setStatsLoading(false)
    }
  }

  const generateCodes = async () => {
    if (codeCount < 1 || codeCount > 10000) return
    // Enforce frontend quota guard
    if (stats?.remaining_code_quota !== undefined && codeCount > stats.remaining_code_quota) {
      setError(`超出可生成配额（剩余 ${stats.remaining_code_quota} 个）`)
      return
    }

    setGenerateLoading(true)
    try {
      const response = await fetch("/api/admin/codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          count: codeCount,
          prefix: codePrefix || undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedCodes(data.codes)
        loadStats()
        if (codes.length > 0) {
          loadCodes() // 刷新兑换码列表
        }
      } else {
        const data = await response.json().catch(() => ({ detail: undefined }))
        setError(data?.message || data?.detail || "生成兑换码失败")
      }
    } catch (error) {
      setError("生成兑换码失败")
    } finally {
      setGenerateLoading(false)
    }
  }

  const disableCode = async (codeId: number) => {
    try {
      const response = await fetch(`/api/admin/codes/${codeId}/disable`, {
        method: "POST",
      })

      if (response.ok) {
        loadCodes()
        loadStats()
      } else {
        setError("禁用兑换码失败")
      }
    } catch (error) {
      setError("禁用兑换码失败")
    }
  }

  const deleteMother = async (motherId: number) => {
    if (!confirm("确定要删除这个母账号吗？此操作不可撤销。")) return

    try {
      const response = await fetch(`/api/admin/mothers/${motherId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        loadMothers()
        loadStats()
      } else {
        const data = await response.json()
        setError(data.detail || "删除母账号失败")
      }
    } catch (error) {
      setError("删除母账号失败")
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const downloadCodes = () => {
    const content = generatedCodes.join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `codes-${new Date().toISOString().split("T")[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("zh-CN")
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
      case "success":
      case "completed":
      case "sent":
        return "bg-green-500/20 text-green-600 border-green-500/30"
      case "pending":
      case "processing":
        return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30"
      case "failed":
      case "error":
        return "bg-red-500/20 text-red-600 border-red-500/30"
      default:
        return ""
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "sent":
        return "✅ 已发送"
      case "pending":
        return "⏳ 待处理"
      case "failed":
        return "❌ 失败"
      case "active":
        return "✅ 活跃"
      default:
        return status
    }
  }

  const handleSelectAllUsers = (checked: boolean) => {
    if (checked) {
      setSelectedUsers(users.map((user) => user.id))
    } else {
      setSelectedUsers([])
    }
  }

  const handleSelectUser = (userId: number, checked: boolean) => {
    if (checked) {
      setSelectedUsers((prev) => [...prev, userId])
    } else {
      setSelectedUsers((prev) => prev.filter((id) => id !== userId))
    }
  }

  const handleSelectAllCodes = (checked: boolean) => {
    if (checked) {
      setSelectedCodes(codes.filter((code) => !code.is_used).map((code) => code.id))
    } else {
      setSelectedCodes([])
    }
  }

  const handleSelectCode = (codeId: number, checked: boolean) => {
    if (checked) {
      setSelectedCodes((prev) => [...prev, codeId])
    } else {
      setSelectedCodes((prev) => prev.filter((id) => id !== codeId))
    }
  }

  const executeBatchOperation = async () => {
    if (!batchOperation || (selectedUsers.length === 0 && selectedCodes.length === 0)) return

    setBatchLoading(true)
    try {
      const endpoint = selectedUsers.length > 0 ? "/api/admin/batch/users" : "/api/admin/batch/codes"
      const ids = selectedUsers.length > 0 ? selectedUsers : selectedCodes

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: batchOperation,
          ids: ids,
          confirm: true,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        alert(`批量操作完成: ${data.message}`)

        // Refresh data and clear selections
        if (selectedUsers.length > 0) {
          loadUsers()
          setSelectedUsers([])
        } else {
          loadCodes()
          setSelectedCodes([])
        }
        setBatchOperation("")
        loadStats()
      } else {
        const errorData = await response.json()
        setError(errorData.message || "批量操作失败")
      }
    } catch (error) {
      setError("批量操作失败")
    } finally {
      setBatchLoading(false)
    }
  }

  const exportData = async (type: string, format = "csv") => {
    setExportLoading(true)
    try {
      const response = await fetch(`/api/admin/export/${type}?format=${format}`, {
        method: "GET",
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${type}-export-${new Date().toISOString().split("T")[0]}.${format}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } else {
        setError("导出失败")
      }
    } catch (error) {
      setError("导出失败")
    } finally {
      setExportLoading(false)
    }
  }

  if (authenticated === false) {
    return (
      <div className="min-h-screen bg-background grid-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/40 bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-primary-foreground font-bold">🔒</span>
            </div>
            <CardTitle className="text-2xl">管理员登录</CardTitle>
            <CardDescription>请输入管理员密码以访问后台</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="请输入管理员密码"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="pr-10 bg-background/50 border-border/60"
                    disabled={loginLoading}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "👁️" : "👁️‍🗨️"}
                  </Button>
                </div>
              </div>

              {loginError && (
                <Alert className="border-red-500/50 bg-red-500/10">
                  <AlertDescription className="text-red-600">{loginError}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={loginLoading || !loginPassword.trim()}
              >
                {loginLoading ? "登录中..." : "🔓 登录"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-background grid-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">检查登录状态...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background grid-bg">
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold">⚙️</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold">管理员后台</h1>
                <p className="text-sm text-muted-foreground">GPT Team 邀请服务管理</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-background/50 border border-border/40">
                <div
                  className={`w-2 h-2 rounded-full ${
                    serviceStatus.backend === "online"
                      ? "bg-green-500"
                      : serviceStatus.backend === "offline"
                        ? "bg-red-500"
                        : "bg-yellow-500"
                  }`}
                />
                <span className="text-xs text-muted-foreground">
                  后端服务:{" "}
                  {serviceStatus.backend === "online" ? "在线" : serviceStatus.backend === "offline" ? "离线" : "未知"}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={loadStats} disabled={statsLoading}>
                {statsLoading ? "🔄" : "🔄"} 刷新数据
              </Button>
              <Button variant="outline" onClick={handleLogout} className="border-border/60 bg-transparent">
                🚪 退出登录
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 bg-muted/50">
            <TabsTrigger value="overview" className="flex items-center space-x-2">
              <span>📊 概览</span>
            </TabsTrigger>
            <TabsTrigger value="mothers" className="flex items-center space-x-2">
              <span>🖥️ 母账号</span>
            </TabsTrigger>
            <TabsTrigger value="codes" className="flex items-center space-x-2">
              <span>🔑 兑换码</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center space-x-2">
              <span>👥 用户管理</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center space-x-2">
              <span>📋 审计日志</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center space-x-2">
              <span>⚙️ 设置</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {serviceStatus.backend === "offline" && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertDescription className="text-red-600">
                  ⚠️ 后端服务当前不可用，数据可能不是最新的。请检查服务状态或联系系统管理员。
                  {serviceStatus.lastCheck && (
                    <span className="block text-xs mt-1">
                      最后检查时间: {serviceStatus.lastCheck.toLocaleString("zh-CN")}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-border/40 bg-card/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">总兑换码</CardTitle>
                  <span className="text-2xl">🔑</span>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.total_codes || 0}</div>
                  <p className="text-xs text-muted-foreground">已使用: {stats?.used_codes || 0}</p>
                  <Progress value={stats ? (stats.used_codes / stats.total_codes) * 100 : 0} className="mt-2 h-1" />
                </CardContent>
              </Card>

              <Card className="border-border/40 bg-card/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">总用户</CardTitle>
                  <span className="text-2xl">👥</span>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.total_users || 0}</div>
                  <p className="text-xs text-muted-foreground">成功邀请: {stats?.successful_invites || 0}</p>
                </CardContent>
              </Card>

              <Card className="border-border/40 bg-card/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">活跃团队</CardTitle>
                  <span className="text-2xl">🏢</span>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.active_teams || mothers.filter((m) => m.status === "active").length}
                  </div>
                  <p className="text-xs text-muted-foreground">总母账号: {mothers.length}</p>
                </CardContent>
              </Card>

              <Card className="border-border/40 bg-card/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">使用率</CardTitle>
                  <span className="text-2xl">📈</span>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.usage_rate ||
                      (mothers.length > 0
                        ? Math.round(
                            (mothers.reduce((sum, m) => sum + m.seats_used, 0) /
                              mothers.reduce((sum, m) => sum + m.seat_limit, 0)) *
                              100,
                          )
                        : 0)}
                    %
                  </div>
                  <p className="text-xs text-muted-foreground">席位使用率</p>
                </CardContent>
              </Card>
            </div>

            {stats && stats.pending_invites > 0 && (
              <Alert className="border-yellow-500/50 bg-yellow-500/10">
                <AlertDescription className="text-yellow-600">
                  当前有 {stats.pending_invites} 个待处理的邀请请求
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertDescription className="text-red-600">{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {stats?.status_breakdown && (
                <Card className="border-border/40 bg-card/50">
                  <CardHeader>
                    <CardTitle>邀请状态分布</CardTitle>
                    <CardDescription>各状态的邀请数量统计</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(stats.status_breakdown).map(([status, count]) => (
                        <div key={status} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Badge className={getStatusColor(status)}>{getStatusText(status)}</Badge>
                          </div>
                          <div className="font-medium">{count}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {stats?.mother_usage && stats.mother_usage.length > 0 && (
                <Card className="border-border/40 bg-card/50">
                  <CardHeader>
                    <CardTitle>母账号使用情况</CardTitle>
                    <CardDescription>各母账号的席位使用统计</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.mother_usage.slice(0, 5).map((mother) => (
                        <div key={mother.id} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{mother.name}</span>
                            <span className="text-muted-foreground">
                              {mother.seats_used}/{mother.seat_limit} ({mother.usage_rate}%)
                            </span>
                          </div>
                          <Progress value={mother.usage_rate} className="h-1" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {stats?.recent_activity && stats.recent_activity.length > 0 && (
              <Card className="border-border/40 bg-card/50">
                <CardHeader>
                  <CardTitle>最近活动</CardTitle>
                  <CardDescription>过去7天的邀请和兑换统计</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats.recent_activity.map((activity, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="text-sm font-medium">{activity.date}</div>
                        <div className="flex space-x-4 text-sm">
                          <span className="text-blue-600">邀请: {activity.invites}</span>
                          <span className="text-green-600">兑换: {activity.redemptions}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="mothers" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">母账号管理</h2>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={loadMothers} disabled={loading}>
                  {loading ? "🔄" : "🔄"} 刷新
                </Button>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90">➕ 添加母账号</Button>
              </div>
            </div>

            {serviceStatus.backend === "offline" && mothers.length === 0 && (
              <Card className="border-border/40 bg-card/50">
                <CardContent className="text-center py-12">
                  <div className="text-6xl mb-4">🔌</div>
                  <h3 className="text-lg font-semibold mb-2">后端服务不可用</h3>
                  <p className="text-muted-foreground mb-4">无法连接到后端服务，请检查服务状态。</p>
                  <Button variant="outline" onClick={loadMothers} disabled={loading}>
                    {loading ? "重试中..." : "重试连接"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6">
              {mothers.map((mother) => (
                <Card key={mother.id} className="border-border/40 bg-card/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{mother.name}</CardTitle>
                        <CardDescription>ID: {mother.id}</CardDescription>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={mother.status === "active" ? "default" : "secondary"}
                          className={
                            mother.status === "active" ? "bg-green-500/20 text-green-600 border-green-500/30" : ""
                          }
                        >
                          {mother.status === "active" ? "✅ 活跃" : "❌ 非活跃"}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingMother(mother)
                            setEditDialogOpen(true)
                          }}
                        >
                          ✏️ 编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMother(mother.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          🗑️ 删除
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">席位限制</div>
                        <div className="font-medium">{mother.seat_limit}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">已用席位</div>
                        <div className="font-medium">{mother.seats_used}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">使用率</div>
                        <div className="font-medium">{Math.round((mother.seats_used / mother.seat_limit) * 100)}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">团队数量</div>
                        <div className="font-medium">{mother.teams.length}</div>
                      </div>
                    </div>

                    {mother.notes && (
                      <>
                        <Separator />
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">备注</div>
                          <div className="text-sm">{mother.notes}</div>
                        </div>
                      </>
                    )}

                    <Separator />
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">团队列表</div>
                      <div className="space-y-2">
                        {mother.teams.map((team, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 rounded border border-border/40 bg-background/30"
                          >
                            <div>
                              <div className="font-medium text-sm">{team.team_name || team.team_id}</div>
                              <div className="text-xs text-muted-foreground">{team.team_id}</div>
                            </div>
                            <div className="flex space-x-2">
                              {team.is_default && (
                                <Badge variant="outline" className="text-xs">
                                  默认
                                </Badge>
                              )}
                              <Badge
                                variant={team.is_enabled ? "default" : "secondary"}
                                className={
                                  team.is_enabled
                                    ? "bg-green-500/20 text-green-600 border-green-500/30 text-xs"
                                    : "text-xs"
                                }
                              >
                                {team.is_enabled ? "✅ 启用" : "❌ 禁用"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="codes" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">兑换码管理</h2>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => exportData("codes")} disabled={exportLoading}>
                  <Download className="w-4 h-4 mr-2" />
                  {exportLoading ? "导出中..." : "导出兑换码"}
                </Button>
                <Button variant="outline" onClick={loadCodes} disabled={codesLoading}>
                  {codesLoading ? "🔄" : "🔄"} 刷新兑换码列表
                </Button>
              </div>
            </div>

            <Card className="border-border/40 bg-card/50">
              <CardHeader>
              <CardTitle>生成兑换码</CardTitle>
              <CardDescription>
                批量生成新的兑换码。配额规则：每个已启用的团队可生成 7 个有效兑换码。
              </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {stats && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div className="p-3 rounded border border-border/40 bg-background/30">
                      <div className="text-muted-foreground">启用团队数</div>
                      <div className="font-medium">{stats.enabled_teams ?? '-'}</div>
                    </div>
                    <div className="p-3 rounded border border-border/40 bg-background/30">
                      <div className="text-muted-foreground">最大容量</div>
                      <div className="font-medium">{stats.max_code_capacity ?? '-'}</div>
                    </div>
                    <div className="p-3 rounded border border-border/40 bg-background/30">
                      <div className="text-muted-foreground">有效未用</div>
                      <div className="font-medium">{stats.active_codes ?? '-'}</div>
                    </div>
                    <div className="p-3 rounded border border-border/40 bg-background/30">
                      <div className="text-muted-foreground">剩余可生成</div>
                      <div className="font-medium">{stats.remaining_code_quota ?? '-'}</div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="count">生成数量</Label>
                    <Input
                      id="count"
                      type="number"
                      min="1"
                      max="10000"
                      value={codeCount}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value) || 1
                        const limit = stats?.remaining_code_quota ?? 10000
                        setCodeCount(Math.min(Math.max(1, n), Math.min(10000, limit)))
                      }}
                      className="bg-background/50 border-border/60"
                    />
                    {stats?.remaining_code_quota !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        剩余可生成：{stats.remaining_code_quota}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prefix">前缀 (可选)</Label>
                    <Input
                      id="prefix"
                      type="text"
                      placeholder="例如: VIP"
                      value={codePrefix}
                      onChange={(e) => setCodePrefix(e.target.value)}
                      className="bg-background/50 border-border/60"
                    />
                  </div>
                </div>

                <Button
                  onClick={generateCodes}
                  disabled={
                    generateLoading ||
                    codeCount < 1 ||
                    codeCount > 10000 ||
                    (stats?.remaining_code_quota !== undefined && stats.remaining_code_quota <= 0)
                  }
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {generateLoading ? "⏳ 生成中..." : "🔑 生成兑换码"}
                </Button>
              </CardContent>
            </Card>

            {generatedCodes.length > 0 && (
              <Card className="border-border/40 bg-card/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>生成的兑换码</CardTitle>
                      <CardDescription>共 {generatedCodes.length} 个兑换码</CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(generatedCodes.join("\n"))}>
                        📋 复制全部
                      </Button>
                      <Button variant="outline" size="sm" onClick={downloadCodes}>
                        💾 下载
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-60 overflow-y-auto space-y-1 p-3 bg-background/30 rounded border border-border/40">
                    {generatedCodes.map((code, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 hover:bg-accent/50 rounded text-sm font-mono"
                      >
                        <span>{code}</span>
                        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(code)} className="h-6 w-6 p-0">
                          📋
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedCodes.length > 0 && (
              <Card className="border-border/40 bg-card/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-sm font-medium">已选择 {selectedCodes.length} 个兑换码</span>
                      <Select value={batchOperation} onValueChange={setBatchOperation}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="选择操作" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disable">禁用兑换码</SelectItem>
                          <SelectItem value="enable">启用兑换码</SelectItem>
                          <SelectItem value="delete">删除兑换码</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" onClick={() => setSelectedCodes([])}>
                        清除选择
                      </Button>
                      <Button
                        onClick={executeBatchOperation}
                        disabled={!batchOperation || batchLoading}
                        className="bg-primary text-primary-foreground"
                      >
                        {batchLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            处理中...
                          </>
                        ) : (
                          "执行操作"
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {codes.length > 0 && (
              <Card className="border-border/40 bg-card/50">
                <CardHeader>
                  <CardTitle>兑换码列表</CardTitle>
                  <CardDescription>管理所有生成的兑换码</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedCodes.length === codes.filter((code) => !code.is_used).length}
                              onCheckedChange={handleSelectAllCodes}
                            />
                          </TableHead>
                          <TableHead>兑换码</TableHead>
                          <TableHead>批次ID</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>使用者</TableHead>
                          <TableHead>创建时间</TableHead>
                          <TableHead>过期时间</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {codes.slice(0, 50).map((code) => (
                          <TableRow key={code.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedCodes.includes(code.id)}
                                onCheckedChange={(checked) => handleSelectCode(code.id, checked as boolean)}
                                disabled={code.is_used}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{code.code}</TableCell>
                            <TableCell className="text-sm">{code.batch_id || "-"}</TableCell>
                            <TableCell>
                              <Badge className={code.is_used ? "bg-green-500/20 text-green-600" : ""}>
                                {code.is_used ? "✅ 已使用" : "⏳ 未使用"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{code.used_by || "-"}</TableCell>
                            <TableCell className="text-sm">{formatDate(code.created_at)}</TableCell>
                            <TableCell className="text-sm">
                              {code.expires_at ? formatDate(code.expires_at) : "永不过期"}
                            </TableCell>
                            <TableCell>
                              {!code.is_used && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => disableCode(code.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  禁用
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {codes.length > 50 && (
                    <div className="mt-4 text-center text-sm text-muted-foreground">
                      显示前50条记录，共 {codes.length} 条记录
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">用户管理</h2>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => exportData("users")} disabled={exportLoading}>
                  <Download className="w-4 h-4 mr-2" />
                  {exportLoading ? "导出中..." : "导出用户"}
                </Button>
                <Button variant="outline" onClick={loadUsers} disabled={usersLoading}>
                  {usersLoading ? "🔄" : "🔄"} 刷新
                </Button>
              </div>
            </div>

            {selectedUsers.length > 0 && (
              <Card className="border-border/40 bg-card/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-sm font-medium">已选择 {selectedUsers.length} 个用户</span>
                      <Select value={batchOperation} onValueChange={setBatchOperation}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="选择操作" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="resend">重发邀请</SelectItem>
                          <SelectItem value="cancel">取消邀请</SelectItem>
                          <SelectItem value="remove">移除用户</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" onClick={() => setSelectedUsers([])}>
                        清除选择
                      </Button>
                      <Button
                        onClick={executeBatchOperation}
                        disabled={!batchOperation || batchLoading}
                        className="bg-primary text-primary-foreground"
                      >
                        {batchLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            处理中...
                          </>
                        ) : (
                          "执行操作"
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-border/40 bg-card/50">
              <CardHeader>
                <CardTitle>用户列表</CardTitle>
                <CardDescription>管理所有用户邀请状态</CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-muted-foreground">加载用户数据中...</p>
                  </div>
                ) : users.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedUsers.length === users.length}
                              onCheckedChange={handleSelectAllUsers}
                            />
                          </TableHead>
                          <TableHead>用户ID</TableHead>
                          <TableHead>邮箱</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>团队</TableHead>
                          <TableHead>兑换码</TableHead>
                          <TableHead>邀请时间</TableHead>
                          <TableHead>兑换时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedUsers.includes(user.id)}
                                onCheckedChange={(checked) => handleSelectUser(user.id, checked as boolean)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{user.id}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(user.status)}>{getStatusText(user.status)}</Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium text-sm">{user.team_name || "未分配"}</div>
                                {user.team_id && <div className="text-xs text-muted-foreground">{user.team_id}</div>}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{user.code_used || "-"}</TableCell>
                            <TableCell className="text-sm">{formatDate(user.invited_at)}</TableCell>
                            <TableCell className="text-sm">
                              {user.redeemed_at ? formatDate(user.redeemed_at) : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="text-6xl mb-4">👥</div>
                    <p>暂无用户数据</p>
                    <Button variant="outline" className="mt-4 bg-transparent" onClick={loadUsers}>
                      加载用户数据
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">审计日志</h2>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => exportData("audit")} disabled={exportLoading}>
                  <Download className="w-4 h-4 mr-2" />
                  {exportLoading ? "导出中..." : "导出日志"}
                </Button>
                <Button variant="outline" onClick={loadAuditLogs} disabled={auditLoading}>
                  {auditLoading ? "🔄" : "🔄"} 刷新日志
                </Button>
              </div>
            </div>

            <Card className="border-border/40 bg-card/50">
              <CardHeader>
                <CardTitle>操作日志</CardTitle>
                <CardDescription>系统操作的详细记录</CardDescription>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-muted-foreground">加载审计日志中...</p>
                  </div>
                ) : auditLogs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>时间</TableHead>
                          <TableHead>操作者</TableHead>
                          <TableHead>操作</TableHead>
                          <TableHead>目标</TableHead>
                          <TableHead>详情</TableHead>
                          <TableHead>IP地址</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm">{formatDate(log.created_at)}</TableCell>
                            <TableCell className="font-medium">{log.actor}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{log.action}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {log.target_type && log.target_id ? `${log.target_type}:${log.target_id}` : "-"}
                            </TableCell>
                            <TableCell className="text-sm max-w-xs truncate">{log.payload_redacted || "-"}</TableCell>
                            <TableCell className="text-sm font-mono">{log.ip || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="text-6xl mb-4">📋</div>
                    <p>暂无审计日志</p>
                    <Button variant="outline" className="mt-4 bg-transparent" onClick={loadAuditLogs}>
                      加载审计日志
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">系统设置</h2>
            </div>

            <Card className="border-border/40 bg-card/50">
              <CardHeader>
                <CardTitle>系统维护</CardTitle>
                <CardDescription>系统清理和维护操作</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-border/40 rounded-lg">
                  <div>
                    <h4 className="font-medium">清理过期席位</h4>
                    <p className="text-sm text-muted-foreground">清理长时间未使用的held状态席位</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const response = await fetch("/api/admin/cleanup", { method: "POST" })
                        if (response.ok) {
                          const data = await response.json()
                          alert(`已清理 ${data.cleaned} 个过期席位`)
                          loadStats()
                        }
                      } catch (error) {
                        setError("清理操作失败")
                      }
                    }}
                  >
                    🧹 执行清理
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 border border-border/40 rounded-lg">
                  <div>
                    <h4 className="font-medium">注销所有会话</h4>
                    <p className="text-sm text-muted-foreground">强制注销所有管理员会话</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (confirm("确定要注销所有管理员会话吗？")) {
                        try {
                          await fetch("/api/admin/logout-all", { method: "POST" })
                          alert("所有会话已注销")
                        } catch (error) {
                          setError("注销操作失败")
                        }
                      }
                    }}
                    className="text-red-600 hover:text-red-700"
                  >
                    🚪 注销所有会话
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/50">
              <CardHeader>
                <CardTitle>系统信息</CardTitle>
                <CardDescription>当前系统运行状态</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">后端地址</div>
                    <div className="font-mono">{process.env.NEXT_PUBLIC_BACKEND_URL || "未配置"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">构建时间</div>
                    <div className="font-mono">{new Date().toISOString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑母账号</DialogTitle>
            <DialogDescription>修改母账号的基本信息和团队配置</DialogDescription>
          </DialogHeader>
          {editingMother && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>账号名称</Label>
                <Input
                  value={editingMother.name}
                  onChange={(e) =>
                    setEditingMother({
                      ...editingMother,
                      name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>备注</Label>
                <Textarea
                  value={editingMother.notes || ""}
                  onChange={(e) =>
                    setEditingMother({
                      ...editingMother,
                      notes: e.target.value,
                    })
                  }
                  placeholder="可选的备注信息"
                />
              </div>
              <div className="space-y-2">
                <Label>团队配置</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {editingMother.teams.map((team, index) => (
                    <div key={index} className="flex items-center space-x-2 p-2 border rounded">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{team.team_name || team.team_id}</div>
                        <div className="text-xs text-muted-foreground">{team.team_id}</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch checked={team.is_enabled} />
                        <Badge variant={team.is_default ? "default" : "outline"} className="text-xs">
                          {team.is_default ? "默认" : "普通"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  取消
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const response = await fetch(`/api/admin/mothers/${editingMother.id}`, {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          name: editingMother.name,
                          notes: editingMother.notes,
                          teams: editingMother.teams.map((team) => ({
                            team_id: team.team_id,
                            team_name: team.team_name,
                            is_enabled: team.is_enabled,
                            is_default: team.is_default,
                          })),
                        }),
                      })

                      if (response.ok) {
                        setEditDialogOpen(false)
                        setEditingMother(null)
                        loadMothers()
                      } else {
                        setError("更新母账号失败")
                      }
                    } catch (error) {
                      setError("更新母账号失败")
                    }
                  }}
                >
                  保存
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
