"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  RefreshCw,
  Copy,
  EyeOff,
  Edit,
  Trash2,
  Plus,
  Download,
  KeyRound,
  Power,
  RotateCcw,
  Send,
  Ban,
  UserX,
  FileInput,
  Activity,
} from "lucide-react"

import { useKeyboardShortcuts, useGlobalShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useContextMenu } from "@/hooks/use-context-menu"
import { useDragAndDrop } from "@/hooks/use-drag-and-drop"
import { useNotifications } from "@/components/notification-system"
import { useCommandPalette } from "@/components/command-palette"
import { MobileNavigation } from "@/components/mobile-navigation"
import { MobileOptimizedTable } from "@/components/mobile-optimized-table"
import { MobileFAB } from "@/components/mobile-fab"
import { useMobileGestures } from "@/hooks/use-mobile-gestures"
import { useVirtualList } from "@/hooks/use-virtual-list"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useCache } from "@/hooks/use-cache"
import { usePerformanceMonitor } from "@/hooks/use-performance-monitor"
import { VirtualTable } from "@/components/virtual-table"
import { AdminRateLimitDashboard } from "@/components/admin-rate-limit-dashboard"
import { TeamFormInput, BulkHistoryEntry, QuotaSnapshot } from "@/types/admin"
import { BulkMotherImport } from "@/components/admin/bulk-mother-import"
import { BulkHistoryPanel } from "@/components/admin/bulk-history-panel"

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
  mother_id?: number
  mother_name?: string
  team_id?: string
  team_name?: string
  invite_status?: string
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

interface ImportCookieResult {
  access_token: string
  token_expires_at?: string | null
  user_email?: string | null
  account_id?: string | null
}

interface PerformanceStatsResponse {
  total_operations: number
  operations: Record<
    string,
    {
      count?: number
      total_time_ms?: number
      avg_time_ms?: number
    }
  >
  slow_queries: Array<{
    query: string
    duration_ms: number
    last_executed_at?: string | null
  }>
  enabled: boolean
}

interface MotherFormState {
  name: string
  access_token: string
  token_expires_at: string
  notes: string
  teams: TeamFormInput[]
}

interface MotherFormDialogProps {
  mode: "create" | "edit"
  open: boolean
  onOpenChange: (open: boolean) => void
  form: MotherFormState
  onFormChange: (updater: (prev: MotherFormState) => MotherFormState) => void
  onSubmit: (form: MotherFormState) => Promise<void>
  loading: boolean
  error?: string | null
}

const getEmptyMotherFormState = (): MotherFormState => ({
  name: "",
  access_token: "",
  token_expires_at: "",
  notes: "",
  teams: [
    {
      team_id: "",
      team_name: "",
      is_enabled: true,
      is_default: true,
    },
  ],
})

function MotherFormDialog({ mode, open, onOpenChange, form, onFormChange, onSubmit, loading, error }: MotherFormDialogProps) {
  const title = mode === "create" ? "新增母号" : "编辑母号"

  const updateField = (field: keyof MotherFormState, value: string) => {
    onFormChange((prev) => ({ ...prev, [field]: value }))
  }

  const updateTeam = (index: number, field: keyof TeamFormInput, value: string | boolean) => {
    onFormChange((prev) => {
      const teams = prev.teams.map((team, idx) =>
        idx === index ? { ...team, [field]: value } : team
      )
      return { ...prev, teams }
    })
  }

  const addTeam = () => {
    onFormChange((prev) => ({
      ...prev,
      teams: [
        ...prev.teams,
        {
          team_id: "",
          team_name: "",
          is_enabled: true,
          is_default: prev.teams.length === 0,
        },
      ],
    }))
  }

  const removeTeam = (index: number) => {
    onFormChange((prev) => {
      if (prev.teams.length <= 1) return prev
      const teams = prev.teams.filter((_, idx) => idx !== index)
      if (!teams.some((team) => team.is_default) && teams.length > 0) {
        teams[0].is_default = true
      }
      return { ...prev, teams }
    })
  }

  const setDefaultTeam = (index: number) => {
    onFormChange((prev) => ({
      ...prev,
      teams: prev.teams.map((team, idx) => ({
        ...team,
        is_default: idx === index,
      })),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await onSubmit(form)
    } catch {
      // 错误已在外部处理
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" showCloseButton>
        <form onSubmit={handleSubmit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="mother-name">母号名称 *</Label>
              <Input
                id="mother-name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="邮箱或账号"
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="mother-token">访问令牌 *</Label>
              <Input
                id="mother-token"
                value={form.access_token}
                onChange={(e) => updateField("access_token", e.target.value)}
                placeholder="输入访问令牌"
                type="password"
                required={mode === "create"}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">{mode === "edit" ? "留空则保持原令牌" : ""}</p>
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="mother-expire">令牌过期时间</Label>
              <Input
                id="mother-expire"
                type="datetime-local"
                value={form.token_expires_at}
                onChange={(e) => updateField("token_expires_at", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mother-notes">备注</Label>
              <Textarea
                id="mother-notes"
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="可选：备注信息"
                disabled={loading}
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">团队配置</Label>
              <Button type="button" variant="outline" size="sm" onClick={addTeam} disabled={loading}>
                新增团队
              </Button>
            </div>

            {form.teams.map((team, index) => (
              <Card key={index} className="border-border/40 bg-card/40">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Team ID *</Label>
                      <Input
                        value={team.team_id}
                        onChange={(e) => updateTeam(index, "team_id", e.target.value)}
                        placeholder="team-identifier"
                        disabled={loading}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Team 名称</Label>
                      <Input
                        value={team.team_name || ""}
                        onChange={(e) => updateTeam(index, "team_name", e.target.value)}
                        placeholder="可选"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={team.is_enabled}
                        onCheckedChange={(checked) => updateTeam(index, "is_enabled", checked)}
                        disabled={loading}
                      />
                      <span className="text-sm">启用</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={team.is_default}
                        onCheckedChange={() => setDefaultTeam(index)}
                        disabled={loading}
                      />
                      <span className="text-sm">设为默认</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTeam(index)}
                      disabled={loading || form.teams.length <= 1}
                    >
                      移除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "提交中..." : mode === "create" ? "创建" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
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

  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const [csrfToken, setCsrfToken] = useState<string | null>(null)
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
  const [showGenerated, setShowGenerated] = useState(false)

  const [users, setUsers] = useState<UserData[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  const [codes, setCodes] = useState<CodeData[]>([])
  const [codesLoading, setCodesLoading] = useState(false)
  // 码状态视图筛选
  const [codesStatusMother, setCodesStatusMother] = useState<string>("")
  const [codesStatusTeam, setCodesStatusTeam] = useState<string>("")
  const [codesStatusBatch, setCodesStatusBatch] = useState<string>("")

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditLoaded, setAuditLoaded] = useState(false)

  const [performanceStats, setPerformanceStats] = useState<PerformanceStatsResponse | null>(null)
  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [performanceError, setPerformanceError] = useState<string | null>(null)

  const [quota, setQuota] = useState<QuotaSnapshot | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)

  const [bulkHistory, setBulkHistory] = useState<BulkHistoryEntry[]>([])
  const [bulkHistoryLoading, setBulkHistoryLoading] = useState(false)
  const [bulkHistoryLoaded, setBulkHistoryLoaded] = useState(false)
  const [bulkHistoryError, setBulkHistoryError] = useState<string | null>(null)

  const [importCookieInput, setImportCookieInput] = useState("")
  const [importCookieLoading, setImportCookieLoading] = useState(false)
  const [importCookieResult, setImportCookieResult] = useState<ImportCookieResult | null>(null)
  const [importCookieError, setImportCookieError] = useState<string | null>(null)

  const [logoutAllLoading, setLogoutAllLoading] = useState(false)
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [changePasswordForm, setChangePasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null)

  const [userActionLoading, setUserActionLoading] = useState<number | null>(null)

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

  // 批量操作支持的操作列表
  const [supportedBatchActions, setSupportedBatchActions] = useState<{
    codes: string[]
    users: string[]
  }>({ codes: [], users: [] })

  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("created_at")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null)
  const [quickStats, setQuickStats] = useState({
    todayRedemptions: 0,
    todayInvites: 0,
    avgResponseTime: 0,
    successRate: 0,
  })

  const notifications = useNotifications()
  const contextMenu = useContextMenu()
  const dragAndDrop = useDragAndDrop()
  const commandPalette = useCommandPalette()

  const [currentTab, setCurrentTab] = useState<string>("mothers")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createMotherLoading, setCreateMotherLoading] = useState(false)
  const [editMotherLoading, setEditMotherLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [motherFormState, setMotherFormState] = useState<MotherFormState>(getEmptyMotherFormState)

  useEffect(() => {
    const tabParam = searchParams.get("tab")
    if (pathname === "/admin") {
      if (tabParam && tabParam !== currentTab) {
        setCurrentTab(tabParam)
      }
      if (!tabParam && currentTab !== "mothers") {
        setCurrentTab("mothers")
      }
    }
  }, [searchParams, pathname])

  useEffect(() => {
    if (typeof window === "undefined" || pathname !== "/admin") return
    const params = new URLSearchParams(window.location.search)
    const existing = params.get("tab") ?? undefined

    let needsUpdate = false
    if (currentTab === "mothers") {
      if (existing) {
        params.delete("tab")
        needsUpdate = true
      }
    } else if (existing !== currentTab) {
      params.set("tab", currentTab)
      needsUpdate = true
    }

    if (needsUpdate) {
      const query = params.toString()
      router.replace(`/admin${query ? `?${query}` : ""}`, { scroll: false })
    }
  }, [currentTab, router, pathname])

  const ensureCsrfToken = useCallback(async () => {
    if (csrfToken) return csrfToken
    const resp = await fetch("/api/admin/csrf-token", { credentials: "include" })
    if (!resp.ok) {
      throw new Error("无法获取 CSRF token，请重新登录")
    }
    const data = await resp.json()
    if (!data?.csrf_token) {
      throw new Error("CSRF token 返回无效")
    }
    setCsrfToken(data.csrf_token)
    return data.csrf_token as string
  }, [csrfToken])

  useEffect(() => {
    if (createDialogOpen) {
      setMotherFormState(getEmptyMotherFormState())
      setFormError(null)
    }
  }, [createDialogOpen])

  useEffect(() => {
    if (editDialogOpen && editingMother) {
      setFormError(null)
      const formFromMother: MotherFormState = {
        name: editingMother.name,
        access_token: "",
        token_expires_at: editingMother.token_expires_at
          ? new Date(editingMother.token_expires_at).toISOString().slice(0, 16)
          : "",
        notes: editingMother.notes || "",
        teams:
          editingMother.teams.length > 0
            ? editingMother.teams.map((team, idx) => ({
                team_id: team.team_id,
                team_name: team.team_name || "",
                is_enabled: team.is_enabled,
                is_default: idx === 0 ? true : team.is_default,
              }))
            : getEmptyMotherFormState().teams,
      }
      setMotherFormState(formFromMother)
    }
  }, [editDialogOpen, editingMother])

  const { isTouch } = useMobileGestures()

  const performanceMetrics = usePerformanceMonitor("AdminDashboard")
  const statsCache = useCache<StatsData>()

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300)

  const itemHeight = 60
  const containerHeight = 400
  const overscan = 5

  const remainingQuota = quota?.remaining_quota ?? (
    stats?.remaining_code_quota ?? (
      stats?.max_code_capacity !== undefined && stats?.active_codes !== undefined
        ? Math.max((stats?.max_code_capacity ?? 0) - (stats?.active_codes ?? 0), 0)
        : null
    )
  )
  const maxCodeCapacity = quota?.max_code_capacity ?? stats?.max_code_capacity ?? null
  const activeCodesCount = quota?.active_codes ?? stats?.active_codes ?? null

  const clampCodeCount = useCallback(
    (raw: number) => {
      const upper = remainingQuota ?? 10000
      const bounded = Math.max(0, Math.min(raw, upper ?? 10000))
      return bounded
    },
    [remainingQuota]
  )

  const filteredUsers = useMemo(() => {
    const filtered = users.filter((user) => {
      const matchesSearch =
        debouncedSearchTerm === "" ||
        user.email.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        user.code_used?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        user.team_name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())

      const matchesStatus = filterStatus === "all" || user.status === filterStatus

      return matchesSearch && matchesStatus
    })

    return filtered.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] || ""
      const bVal = b[sortBy as keyof typeof b] || ""
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortOrder === "asc" ? comparison : -comparison
    })
  }, [users, debouncedSearchTerm, filterStatus, sortBy, sortOrder])

  const filteredCodes = useMemo(() => {
    const filtered = codes.filter((code) => {
      const matchesSearch =
        debouncedSearchTerm === "" ||
        code.code.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        code.batch_id?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        code.used_by?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())

      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "used" && code.is_used) ||
        (filterStatus === "unused" && !code.is_used)

      return matchesSearch && matchesStatus
    })

    return filtered.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] || ""
      const bVal = b[sortBy as keyof typeof b] || ""
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortOrder === "asc" ? comparison : -comparison
    })
  }, [codes, debouncedSearchTerm, filterStatus, sortBy, sortOrder])

  // 兑换码状态视图的额外筛选
  const uniqueMothers = useMemo(() => {
    const s = new Set<string>()
    codes.forEach((c) => c.mother_name && s.add(c.mother_name))
    return Array.from(s)
  }, [codes])
  const uniqueTeams = useMemo(() => {
    const s = new Set<string>()
    codes.forEach((c) => (c.team_name || c.team_id) && s.add(c.team_name || (c.team_id as string)))
    return Array.from(s)
  }, [codes])
  const uniqueBatches = useMemo(() => {
    const s = new Set<string>()
    codes.forEach((c) => c.batch_id && s.add(c.batch_id))
    return Array.from(s)
  }, [codes])

  const filteredCodesStatus = useMemo(() => {
    return filteredCodes.filter((c) => {
      const motherOk = !codesStatusMother || c.mother_name === codesStatusMother
      const teamOk = !codesStatusTeam || c.team_name === codesStatusTeam || c.team_id === codesStatusTeam
      const batchOk = !codesStatusBatch || c.batch_id === codesStatusBatch
      return motherOk && teamOk && batchOk
    })
  }, [filteredCodes, codesStatusMother, codesStatusTeam, codesStatusBatch])

  const virtualizedUsers = useVirtualList(filteredUsers, {
    itemHeight,
    containerHeight,
    overscan,
  })

  const virtualizedCodes = useVirtualList(filteredCodes, {
    itemHeight,
    containerHeight,
    overscan,
  })

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (authenticated) {
      loadSupportedBatchActions()
    }
  }, [authenticated])

  useEffect(() => {
    if (authenticated) {
      loadQuota()
    } else {
      setQuota(null)
      setBulkHistory([])
      setBulkHistoryLoaded(false)
    }
  }, [authenticated])

  const loadSupportedBatchActions = async () => {
    try {
      const response = await fetch('/api/admin/batch/supported-actions')
      if (response.ok) {
        const data = await response.json()
        setSupportedBatchActions(data)
      }
    } catch (error) {
      console.error('Failed to load supported batch actions:', error)
    }
  }

  useEffect(() => {
    if (autoRefresh && authenticated) {
      const interval = setInterval(() => {
        loadStats()
        if (users.length > 0) loadUsers()
        if (codes.length > 0) loadCodes()
        loadQuota()
      }, 30000) // Refresh every 30 seconds
      setRefreshInterval(interval)
      return () => clearInterval(interval)
    } else if (refreshInterval) {
      clearInterval(refreshInterval)
      setRefreshInterval(null)
    }
  }, [autoRefresh, authenticated])

  // 进入兑换码相关页面时自动加载一次
  useEffect(() => {
    if (authenticated && ["codes", "codes-status"].includes(currentTab) && codes.length === 0 && !codesLoading) {
      loadCodes()
    }
  }, [authenticated, currentTab])

  useEffect(() => {
    if (authenticated && currentTab === "bulk-history" && !bulkHistoryLoaded && !bulkHistoryLoading) {
      loadBulkHistory(true)
    }
  }, [authenticated, currentTab, bulkHistoryLoaded, bulkHistoryLoading])

  useEffect(() => {
    if (["audit", "overview"].includes(currentTab) && !auditLoaded && !auditLoading) {
      loadAuditLogs()
    }
  }, [currentTab, auditLoaded, auditLoading])

  useEffect(() => {
    if (currentTab === "settings" && !performanceStats && !performanceLoading) {
      loadPerformanceStats()
    }
  }, [currentTab, performanceStats, performanceLoading])

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
    setAuditError(null)
    try {
      const response = await fetch("/api/admin/audit-logs")
      if (response.ok) {
        const data = await response.json()
        setAuditLogs(data)
        setAuditLoaded(true)
      } else {
        const data = await response.json().catch(() => ({}))
        setAuditError(data?.message || data?.detail || "加载审计日志失败")
      }
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "加载审计日志失败")
    } finally {
      setAuditLoading(false)
    }
  }

  const loadStats = async () => {
    setStatsLoading(true)

    // Cache is handled automatically by useCache hook based on TTL

    try {
      const response = await fetch("/api/admin/stats")
      if (response.ok) {
        const data = await response.json()
        setStats(data)
        statsCache.set("admin-stats", data) // Cache the data
        const todayKey = new Date().toISOString().slice(5, 10)
        let todayInvites = 0
        let todayRedemptions = 0
        if (Array.isArray(data?.recent_activity)) {
          const todayEntry = data.recent_activity.find((item: { date: string }) => item.date === todayKey)
          if (todayEntry) {
            todayInvites = todayEntry.invites ?? 0
            todayRedemptions = todayEntry.redemptions ?? 0
          }
        }
        const breakdown = (data?.status_breakdown ?? {}) as Record<string, number>
        const totalInvites = Object.values(breakdown).reduce((sum, value) => sum + (value ?? 0), 0)
        const successRate =
          totalInvites > 0 ? Math.round(((breakdown.sent ?? 0) / totalInvites) * 1000) / 10 : 0
        setQuickStats({
          todayInvites,
          todayRedemptions,
          avgResponseTime: 0,
          successRate,
        })
        setServiceStatus({
          backend: "online",
          lastCheck: new Date(),
        })
      } else {
        const errorData = await response.json().catch(() => ({ message: "服务不可用" }))
        if (response.status === 503) {
          console.error("后端服务暂时不可用")
          setStats(null)
          setServiceStatus({
            backend: "offline",
            lastCheck: new Date(),
          })
        } else if (response.status === 502) {
          console.error("后端服务连接失败")
          setStats(null)
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
      setStats(null)
      setServiceStatus({
        backend: "offline",
        lastCheck: new Date(),
      })
    } finally {
      setStatsLoading(false)
    }
  }

  const loadPerformanceStats = async () => {
    setPerformanceLoading(true)
    setPerformanceError(null)
    try {
      const response = await fetch("/api/admin/performance/stats")
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.detail || "加载性能统计失败")
      }
      setPerformanceStats(data as PerformanceStatsResponse)
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载性能统计失败"
      setPerformanceError(message)
    } finally {
      setPerformanceLoading(false)
    }
  }

  const togglePerformanceMonitoring = async () => {
    try {
      const response = await fetch("/api/admin/performance/toggle", {
        method: "POST",
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.detail || "切换性能监控失败")
      }
      notifications.addNotification({
        type: "success",
        title: "性能监控状态",
        message: data?.message || "性能监控状态已更新",
      })
      setPerformanceStats((prev) =>
        prev
              ? {
                  ...prev,
                  enabled: typeof data?.enabled === "boolean" ? data.enabled : !prev.enabled,
                }
              : prev
      )
      loadPerformanceStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : "切换性能监控失败"
      setPerformanceError(message)
      notifications.addNotification({
        type: "error",
        title: "性能监控失败",
        message,
      })
    }
  }

  const resetPerformanceStats = async () => {
    try {
      const response = await fetch("/api/admin/performance/reset", {
        method: "POST",
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.detail || "重置性能统计失败")
      }
      notifications.addNotification({
        type: "success",
        title: "性能统计已重置",
        message: data?.message || "性能统计数据已清空",
      })
      loadPerformanceStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : "重置性能统计失败"
      setPerformanceError(message)
      notifications.addNotification({
        type: "error",
        title: "重置失败",
        message,
      })
    }
  }

  const loadQuota = async () => {
    setQuotaLoading(true)
    setQuotaError(null)
    try {
      const response = await fetch("/api/admin/quota")
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.detail || "获取配额失败")
      }
      setQuota(data as QuotaSnapshot)
      setStats((prev) =>
        prev
          ? {
              ...prev,
              max_code_capacity: typeof data.max_code_capacity === "number" ? data.max_code_capacity : prev.max_code_capacity,
              remaining_code_quota:
                typeof data.remaining_quota === "number" ? data.remaining_quota : prev.remaining_code_quota,
              active_codes: typeof data.active_codes === "number" ? data.active_codes : prev.active_codes,
              total_codes: typeof data.total_codes === "number" ? data.total_codes : prev.total_codes,
              used_codes: typeof data.used_codes === "number" ? data.used_codes : prev.used_codes,
            }
          : prev,
      )
    } catch (error) {
      setQuotaError(error instanceof Error ? error.message : "获取配额失败")
    } finally {
      setQuotaLoading(false)
    }
  }

  const loadBulkHistory = async (force = false) => {
    if (!force && bulkHistoryLoaded) return
    setBulkHistoryLoading(true)
    setBulkHistoryError(null)
    try {
      const response = await fetch(`/api/admin/bulk/history?limit=50`)
      const data = await response.json().catch(() => [])
      if (!response.ok) {
        throw new Error((data as any)?.message || (data as any)?.detail || "获取批量历史失败")
      }
      if (!Array.isArray(data)) {
        throw new Error("批量历史返回格式异常")
      }
      setBulkHistory(data as BulkHistoryEntry[])
      setBulkHistoryLoaded(true)
    } catch (error) {
      setBulkHistoryError(error instanceof Error ? error.message : "获取批量历史失败")
    } finally {
      setBulkHistoryLoading(false)
    }
  }

  const generateCodes = async () => {
    if (codeCount < 1 || codeCount > 10000) return
    // Enforce frontend quota guard
    if (remainingQuota !== null && codeCount > remainingQuota) {
      setError(`超出可生成配额（剩余 ${remainingQuota} 个）`)
      return
    }

    setGenerateLoading(true)
    try {
      const token = await ensureCsrfToken()
      const response = await fetch("/api/admin/codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({
          count: codeCount,
          prefix: codePrefix || undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedCodes(data.codes)
        setShowGenerated(true)
        if (
          typeof data?.remaining_quota === "number" ||
          typeof data?.max_code_capacity === "number" ||
          typeof data?.active_codes === "number"
        ) {
          setStats((prev) =>
            prev
              ? {
                  ...prev,
                  max_code_capacity:
                    typeof data.max_code_capacity === "number"
                      ? data.max_code_capacity
                      : prev.max_code_capacity,
                  active_codes:
                    typeof data.active_codes === "number"
                      ? data.active_codes
                      : prev.active_codes,
                  remaining_code_quota:
                    typeof data.remaining_quota === "number"
                      ? data.remaining_quota
                      : prev.remaining_code_quota,
                }
              : prev
          )
          if (typeof data?.remaining_quota === "number") {
            setCodeCount((prev) => Math.max(0, Math.min(prev, data.remaining_quota)))
          }
        }
        loadStats()
        loadQuota()
        loadBulkHistory(true)
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

  const handleLogoutAll = async () => {
    if (!confirm("确定要撤销所有管理员会话吗？这会强制所有已登录的管理员重新登录。")) {
      return
    }
    setLogoutAllLoading(true)
    try {
      const response = await fetch("/api/admin/logout-all", {
        method: "POST",
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.detail || "撤销会话失败")
      }
      notifications.addNotification({
        type: "success",
        title: "会话已撤销",
        message: data?.message || "所有管理员会话已失效",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "撤销会话失败"
      notifications.addNotification({
        type: "error",
        title: "操作失败",
        message,
      })
    } finally {
      setLogoutAllLoading(false)
    }
  }

  const handleImportCookie = async () => {
    if (!importCookieInput.trim()) {
      setImportCookieError("请输入包含 session 的 Cookie")
      return
    }
    setImportCookieLoading(true)
    setImportCookieError(null)
    try {
      const token = await ensureCsrfToken()
      const response = await fetch("/api/admin/import-cookie", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ cookie: importCookieInput.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.detail || "导入失败")
      }
      setImportCookieResult(data as ImportCookieResult)
      notifications.addNotification({
        type: "success",
        title: "Cookie 已导入",
        message: "访问令牌已提取，可直接创建母号",
      })
      const expires = data?.token_expires_at ? new Date(data.token_expires_at).toISOString().slice(0, 16) : ""
      setMotherFormState((prev) => ({
        ...prev,
        name: data?.user_email || prev.name,
        access_token: data?.access_token || prev.access_token,
        token_expires_at: expires,
      }))
      setCreateDialogOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败"
      setImportCookieError(message)
      notifications.addNotification({
        type: "error",
        title: "导入失败",
        message,
      })
    } finally {
      setImportCookieLoading(false)
    }
  }

  const handleChangePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setChangePasswordError(null)

    const { oldPassword, newPassword, confirmPassword } = changePasswordForm
    if (!oldPassword || !newPassword || !confirmPassword) {
      setChangePasswordError("请完整填写所有字段")
      return
    }
    if (newPassword.length < 8) {
      setChangePasswordError("新密码长度至少 8 位")
      return
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError("两次输入的新密码不一致")
      return
    }

    setChangePasswordLoading(true)
    try {
      const response = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.detail || "修改密码失败")
      }
      notifications.addNotification({
        type: "success",
        title: "密码已更新",
        message: "请妥善保管新的管理员密码",
      })
      setChangePasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "修改密码失败"
      setChangePasswordError(message)
      notifications.addNotification({
        type: "error",
        title: "修改密码失败",
        message,
      })
    } finally {
      setChangePasswordLoading(false)
    }
  }

  const performUserAction = async (user: UserData, action: "resend" | "cancel" | "remove") => {
    if (!user.team_id) {
      notifications.addNotification({
        type: "error",
        title: "无法执行操作",
        message: "该用户缺少团队信息，无法执行邀请操作",
      })
      return
    }
    setUserActionLoading(user.id)
    try {
      let endpoint = "/api/admin/resend"
      let successTitle = "邀请已重发"
      if (action === "cancel") {
        endpoint = "/api/admin/cancel-invite"
        successTitle = "邀请已取消"
      } else if (action === "remove") {
        endpoint = "/api/admin/remove-member"
        successTitle = "成员已移除"
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          team_id: user.team_id,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || data?.detail || "操作失败")
      }
      notifications.addNotification({
        type: "success",
        title: successTitle,
        message: data?.message || `${user.email} 的请求已处理`,
      })
      loadUsers()
      loadStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败"
      notifications.addNotification({
        type: "error",
        title: action === "resend" ? "重发邀请失败" : action === "cancel" ? "取消邀请失败" : "移除成员失败",
        message,
      })
    } finally {
      setUserActionLoading(null)
    }
  }

  const buildMotherPayload = (form: MotherFormState) => {
    const teams = form.teams
      .filter((t) => t.team_id.trim().length > 0)
      .map((t, index) => ({
        team_id: t.team_id.trim(),
        team_name: t.team_name?.trim() || undefined,
        is_enabled: t.is_enabled,
        is_default: t.is_default && index === 0 ? true : t.is_default,
      }))

    const hasDefault = teams.some((t) => t.is_default)
    if (!hasDefault && teams.length > 0) {
      teams[0].is_default = true
    }

    return {
      name: form.name.trim(),
      access_token: form.access_token.trim(),
      token_expires_at: form.token_expires_at ? new Date(form.token_expires_at).toISOString() : null,
      notes: form.notes.trim() || undefined,
      teams,
    }
  }

  const handleCreateMother = async (form: MotherFormState) => {
    setCreateMotherLoading(true)
    setFormError(null)
    try {
      const token = await ensureCsrfToken()
      const payload = buildMotherPayload(form)
      if (!payload.name) {
        throw new Error("母号名称不能为空")
      }
      if (!payload.access_token || payload.access_token.length < 10) {
        throw new Error("访问令牌长度至少10位")
      }
      const resp = await fetch("/api/admin/mothers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data?.detail || data?.message || "创建失败")
      }
      notifications.addNotification({
        type: "success",
        title: "创建成功",
        message: `${payload.name} 已录入`,
      })
      setCreateDialogOpen(false)
      setMotherFormState(getEmptyMotherFormState())
      loadMothers()
      loadStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建母号失败"
      setFormError(message)
      notifications.addNotification({
        type: "error",
        title: "创建母号失败",
        message,
      })
      throw error
    } finally {
      setCreateMotherLoading(false)
    }
  }

  const handleUpdateMother = async (motherId: number, form: MotherFormState) => {
    setEditMotherLoading(true)
    setFormError(null)
    try {
      const payload = buildMotherPayload(form)
      if (!payload.name) {
        throw new Error("母号名称不能为空")
      }
      if (!payload.access_token || payload.access_token.length < 10) {
        throw new Error("请填写新的访问令牌（至少10位）")
      }
      const resp = await fetch(`/api/admin/mothers/${motherId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data?.detail || data?.message || "更新失败")
      }
      notifications.addNotification({
        type: "success",
        title: "更新成功",
        message: `${payload.name} 已更新`,
      })
      setEditDialogOpen(false)
      setEditingMother(null)
      loadMothers()
      loadStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新母号失败"
      setFormError(message)
      notifications.addNotification({
        type: "error",
        title: "更新母号失败",
        message,
      })
      throw error
    } finally {
      setEditMotherLoading(false)
    }
  }

  const copyToClipboard = async (text: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notifications.addNotification({
        type: "success",
        title: "复制成功",
        message: `${label || "内容"}已复制到剪贴板`,
        duration: 2000,
      })
    } catch (error) {
      console.error("Failed to copy:", error)
      notifications.addNotification({
        type: "error",
        title: "复制失败",
        message: "无法访问剪贴板，请手动复制",
        duration: 3000,
      })
    }
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
      const type = selectedUsers.length > 0 ? "users" : "codes"
      const ids = selectedUsers.length > 0 ? selectedUsers : selectedCodes

      const response = await fetch(`/api/admin/batch/${type}`, {
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

        // 使用新的统一响应格式
        if (data.success) {
          notifications.addNotification({
            type: "success",
            title: "批量操作完成",
            message: data.message || "操作成功",
          })
        } else {
          notifications.addNotification({
            type: "warning",
            title: "批量操作完成",
            message: data.message || "操作完成",
          })
        }

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
        loadQuota()
        loadBulkHistory(true)
      } else {
        const errorData = await response.json()
        setError(errorData.message || errorData.detail || "批量操作失败")
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

  useGlobalShortcuts()

  const adminShortcuts = [
    {
      key: "g",
      action: () => {
        const codesTab = document.querySelector('[value="codes"]') as HTMLElement
        codesTab?.click()
        // Focus on generate button after a short delay
        setTimeout(() => {
          const generateButton = document.getElementById('btn-generate-codes') as HTMLButtonElement | null
          if (generateButton && !generateButton.disabled) {
            generateButton.focus()
            generateButton.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      },
      description: "快速生成兑换码",
      category: "操作",
    },
    {
      key: "u",
      action: () => {
        const usersTab = document.querySelector('[value="users"]') as HTMLElement
        usersTab?.click()
      },
      description: "切换到用户管理",
      category: "导航",
    },
    {
      key: "m",
      action: () => {
        const mothersTab = document.querySelector('[value="mothers"]') as HTMLElement
        mothersTab?.click()
      },
      description: "切换到母账号管理",
      category: "导航",
    },
  ]

  useKeyboardShortcuts(adminShortcuts, authenticated === true)

  const handleCodeContextMenu = (event: React.MouseEvent, code: CodeData) => {
    const menuItems = [
      {
        id: "copy-code",
        label: "复制兑换码",
        icon: <Copy className="w-4 h-4" />,
        action: () => copyToClipboard(code.code, "兑换码"),
        shortcut: "Ctrl+C",
      },
      {
        id: "copy-details",
        label: "复制详细信息",
        icon: <Copy className="w-4 h-4" />,
        action: () => {
          const details = `兑换码: ${code.code}\n批次: ${code.batch_id || "无"}\n状态: ${code.is_used ? "已使用" : "未使用"}\n创建时间: ${formatDate(code.created_at)}`
          copyToClipboard(details, "兑换码详情")
        },
      },
      { id: "separator-1", label: "", separator: true },
      {
        id: "disable-code",
        label: code.is_used ? "已使用" : "禁用兑换码",
        icon: <EyeOff className="w-4 h-4" />,
        action: () => !code.is_used && disableCode(code.id),
        disabled: code.is_used,
      },
    ]

    contextMenu.openContextMenu(event, menuItems)
  }

  const handleUserContextMenu = (event: React.MouseEvent, user: UserData) => {
    const menuItems = [
      {
        id: "copy-email",
        label: "复制邮箱",
        icon: <Copy className="w-4 h-4" />,
        action: () => copyToClipboard(user.email, "邮箱地址"),
        shortcut: "Ctrl+C",
      },
      {
        id: "copy-details",
        label: "复制用户信息",
        icon: <Copy className="w-4 h-4" />,
        action: () => {
          const details = `邮箱: ${user.email}\n状态: ${getStatusText(user.status)}\n团队: ${user.team_name || "未分配"}\n兑换码: ${user.code_used || "无"}\n邀请时间: ${formatDate(user.invited_at)}`
          copyToClipboard(details, "用户信息")
        },
      },
      { id: "separator-1", label: "", separator: true },
      {
        id: "resend-invite",
        label: "重发邀请",
        icon: <Send className="w-4 h-4" />,
        action: () => performUserAction(user, "resend"),
        disabled: userActionLoading === user.id || user.status === "sent",
      },
      {
        id: "cancel-invite",
        label: "取消邀请",
        icon: <Ban className="w-4 h-4" />,
        action: () => performUserAction(user, "cancel"),
        disabled: userActionLoading === user.id,
      },
      {
        id: "remove-member",
        label: "移除成员",
        icon: <UserX className="w-4 h-4" />,
        action: () => performUserAction(user, "remove"),
        disabled: userActionLoading === user.id,
      },
    ]

    contextMenu.openContextMenu(event, menuItems)
  }

  const handleMotherContextMenu = (event: React.MouseEvent, mother: MotherAccount) => {
    const menuItems = [
      {
        id: "copy-name",
        label: "复制账号名",
        icon: <Copy className="w-4 h-4" />,
        action: () => copyToClipboard(mother.name, "账号名"),
        shortcut: "Ctrl+C",
      },
      {
        id: "edit-mother",
        label: "编辑账号",
        icon: <Edit className="w-4 h-4" />,
        action: () => {
          setEditingMother(mother)
          setEditDialogOpen(true)
        },
        shortcut: "E",
      },
      { id: "separator-1", label: "", separator: true },
      {
        id: "delete-mother",
        label: "删除账号",
        icon: <Trash2 className="w-4 h-4" />,
        action: () => deleteMother(mother.id),
        disabled: mother.status === "active",
      },
    ]

    contextMenu.openContextMenu(event, menuItems)
  }

  const handleBatchDragDrop = (draggedItems: any[], targetZone: string) => {
    if (targetZone === "batch-operations" && draggedItems.length > 0) {
      notifications.addNotification({
        type: "info",
        title: "批量操作",
        message: `已选择 ${draggedItems.length} 个项目进行批量操作`,
      })
    }
  }

  const userTableColumns = [
    {
      key: "email" as keyof UserData,
      label: "邮箱",
      mobile: { priority: "high" as const },
      render: (value: string) => <span className="font-medium text-foreground">{value}</span>,
    },
    {
      key: "status" as keyof UserData,
      label: "状态",
      mobile: { priority: "medium" as const, label: "状态" },
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(value)}`}>
          {getStatusText(value)}
        </span>
      ),
    },
    {
      key: "team_name" as keyof UserData,
      label: "团队",
      mobile: { priority: "medium" as const, label: "团队" },
      render: (value: string) => value || "未分配",
    },
    {
      key: "code_used" as keyof UserData,
      label: "兑换码",
      mobile: { priority: "low" as const },
      render: (value: string) => value || "无",
    },
    {
      key: "invited_at" as keyof UserData,
      label: "邀请时间",
      mobile: { priority: "low" as const },
      render: (value: string) => formatDate(value),
    },
    {
      key: "actions",
      label: "操作",
      mobile: { priority: "low" as const, label: "操作" },
      render: (_: unknown, user: UserData, _index?: number) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              performUserAction(user, "resend")
            }}
            disabled={userActionLoading === user.id || user.status === "sent"}
          >
            <Send className={`w-4 h-4 mr-1 ${userActionLoading === user.id ? "animate-spin" : ""}`} />
            <span className="hidden xl:inline">重发</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              performUserAction(user, "cancel")
            }}
            disabled={userActionLoading === user.id}
          >
            <Ban className="w-4 h-4 mr-1" />
            <span className="hidden xl:inline">取消</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              performUserAction(user, "remove")
            }}
            disabled={userActionLoading === user.id}
          >
            <UserX className="w-4 h-4 mr-1" />
            <span className="hidden xl:inline">移除</span>
          </Button>
        </div>
      ),
    },
  ]

  const codeTableColumns = [
    {
      key: "code",
      label: "兑换码",
      mobile: { priority: "high" as const },
      render: (value: string) => <span className="font-mono font-medium text-foreground">{value}</span>,
    },
    {
      key: "is_used",
      label: "状态",
      mobile: { priority: "medium" as const, label: "状态" },
      render: (value: boolean) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium border ${
            value
              ? "bg-red-500/20 text-red-600 border-red-500/30"
              : "bg-green-500/20 text-green-600 border-green-500/30"
          }`}
        >
          {value ? "已使用" : "未使用"}
        </span>
      ),
    },
    {
      key: "used_by",
      label: "邮箱",
      mobile: { priority: "medium" as const },
      render: (value: string) => value || "-",
    },
    {
      key: "mother_name",
      label: "母号",
      mobile: { priority: "low" as const },
      render: (value: string) => value || "-",
    },
    {
      key: "team_name",
      label: "团队",
      mobile: { priority: "low" as const },
      render: (value: string, row: CodeData) => value || row.team_id || "-",
    },
    {
      key: "batch_id",
      label: "批次",
      mobile: { priority: "medium" as const, label: "批次" },
      render: (value: string) => value || "无",
    },
    {
      key: "used_at",
      label: "使用时间",
      mobile: { priority: "low" as const },
      render: (value: string) => (value ? formatDate(value) : "-"),
    },
    {
      key: "created_at",
      label: "创建时间",
      mobile: { priority: "low" as const },
      render: (value: string) => formatDate(value),
    },
  ]

  const fabActions = [
    {
      id: "generate-codes",
      label: "生成兑换码",
      icon: <Plus className="w-5 h-5" />,
      action: () => {
        setCurrentTab("codes")
        // Focus on generate section
        setTimeout(() => {
          const generateSection = document.getElementById("generate-codes-section")
          generateSection?.scrollIntoView({ behavior: "smooth" })
        }, 100)
      },
      color: "bg-primary hover:bg-primary/90",
    },
    {
      id: "export-data",
      label: "导出数据",
      icon: <Download className="w-5 h-5" />,
      action: () => {
        if (currentTab === "users") {
          exportData("users")
        } else if (currentTab === "codes") {
          exportData("codes")
        }
      },
      color: "bg-blue-500 hover:bg-blue-600",
    },
  ]

  if (authenticated === false) {
    return (
      <div className="min-h-screen bg-background grid-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/40 bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-primary-foreground font-bold">🔒</span>
            </div>
            <CardTitle className="text-xl sm:text-2xl">管理员登录</CardTitle>
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
                    className={`pr-10 bg-background/50 border-border/60 ${isTouch ? "min-h-[44px] text-base" : ""}`}
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
                className={`w-full bg-primary text-primary-foreground hover:bg-primary/90 ${isTouch ? "min-h-[48px] text-base" : ""}`}
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
    <div className="min-h-screen bg-background grid-bg pb-20 md:pb-0">
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <MobileNavigation currentTab={currentTab} onTabChange={setCurrentTab} onLogout={handleLogout} />

              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-brand-secondary rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-primary-foreground font-bold text-sm sm:text-base">⚙️</span>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg sm:text-xl font-semibold bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent">
                  管理员后台
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">GPT Team 邀请服务管理</p>
              </div>
            </div>

            <div className="hidden md:flex items-center space-x-3">
              <div className="flex items-center space-x-2 px-3 py-2 rounded-full bg-background/50 border border-border/40">
                <div
                  className={`w-2 h-2 rounded-full ${
                    serviceStatus.backend === "online"
                      ? "bg-green-500 animate-pulse"
                      : serviceStatus.backend === "offline"
                        ? "bg-red-500"
                        : "bg-yellow-500 animate-pulse"
                  }`}
                />
                <span className="text-xs text-muted-foreground">
                  {serviceStatus.backend === "online"
                    ? "在线"
                    : serviceStatus.backend === "offline"
                      ? "离线"
                      : "检查中"}
                </span>
                {serviceStatus.lastCheck && (
                  <span className="text-xs text-muted-foreground opacity-60">
                    {new Date(serviceStatus.lastCheck).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 px-3 py-2 rounded-full bg-background/50 border border-border/40">
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                <span className="text-xs text-muted-foreground">自动刷新</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={loadStats}
                disabled={statsLoading}
                className="hover:scale-105 transition-transform bg-transparent"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${statsLoading ? "animate-spin" : ""}`} />
                刷新数据
              </Button>
              <Button
                variant="outline"
                onClick={handleLogout}
                className="border-border/60 bg-transparent hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-600 transition-all"
              >
                🚪 退出登录
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 sm:py-8">
        {error && (
          <Alert className="mb-6 border-red-500/50 bg-red-500/10">
            <AlertDescription className="text-red-600">{error}</AlertDescription>
          </Alert>
        )}

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
            <Card className="border-border/40 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground">总兑换码</p>
                    <p className="text-lg sm:text-2xl font-bold text-primary">{stats.total_codes}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      已使用: {stats.used_codes} ({((stats.used_codes / stats.total_codes) * 100).toFixed(1)}%)
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                    <span className="text-primary text-sm sm:text-base">🎫</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground">总用户</p>
                    <p className="text-lg sm:text-2xl font-bold text-green-600">{stats.total_users}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">成功邀请: {stats.successful_invites}</p>
                  </div>
                  <div className="w-8 h-8 sm:w-12 sm:h-12 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                    <span className="text-green-600 text-sm sm:text-base">👥</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground">活跃团队</p>
                    <p className="text-lg sm:text-2xl font-bold text-blue-600">{stats.active_teams}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      使用率: {(stats.usage_rate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-12 sm:h-12 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                    <span className="text-blue-600 text-sm sm:text-base">🏢</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground">待处理邀请</p>
                    <p className="text-lg sm:text-2xl font-bold text-orange-600">{stats.pending_invites}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {stats.remaining_code_quota !== undefined && <>剩余配额: {stats.remaining_code_quota}</>}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-12 sm:h-12 bg-orange-500/10 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                    <span className="text-orange-600 text-sm sm:text-base">⏳</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
        {["users", "codes", "codes-status"].includes(currentTab) && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1">
                <Input
                  placeholder="搜索用户、兑换码、团队..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`bg-background/50 border-border/60 ${isTouch ? "min-h-[44px] text-base" : ""}`}
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={`px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm ${isTouch ? "min-h-[44px]" : ""}`}
                >
                  <option value="all">所有状态</option>
                  <option value="sent">已发送</option>
                  <option value="pending">待处理</option>
                  <option value="failed">失败</option>
                  <option value="used">已使用</option>
                  <option value="unused">未使用</option>
                </select>
                <Button
                  variant="outline"
                  size={isTouch ? "default" : "sm"}
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="bg-transparent"
                >
                  高级筛选
                </Button>
              </div>
            </div>

            {showAdvancedFilters && (
              <div className="p-3 sm:p-4 border border-border/40 rounded-lg bg-card/30 backdrop-blur-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <Label className="text-sm">排序字段</Label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm ${isTouch ? "min-h-[44px]" : ""}`}
                    >
                      <option value="created_at">创建时间</option>
                      <option value="email">邮箱</option>
                      <option value="status">状态</option>
                      <option value="team_name">团队</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm">排序方向</Label>
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                      className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm ${isTouch ? "min-h-[44px]" : ""}`}
                    >
                      <option value="desc">降序</option>
                      <option value="asc">升序</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      size={isTouch ? "default" : "sm"}
                      onClick={() => {
                        setSearchTerm("")
                        setFilterStatus("all")
                        setSortBy("created_at")
                        setSortOrder("desc")
                      }}
                      className="bg-transparent w-full sm:w-auto"
                    >
                      重置筛选
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </div>

        {process.env.NODE_ENV === "development" && performanceMetrics.metrics && (
          <div className="mb-4 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
            Render Time: {performanceMetrics.metrics.renderTime}ms | Rerenders: {performanceMetrics.metrics.reRenderCount} | Components: {performanceMetrics.metrics.componentCount}
          </div>
        )}

        {currentTab === "users" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">用户管理</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => statsCache.clear()} className="hidden sm:flex">
                  清除缓存
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadUsers()}
                  disabled={usersLoading}
                  className="hidden sm:flex"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${usersLoading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </div>
            </div>

            {/* 批量操作UI */}
            {selectedUsers.length > 0 && (
              <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">
                        已选择 {selectedUsers.length} 个用户
                      </span>
                      <select
                        value={batchOperation}
                        onChange={(e) => setBatchOperation(e.target.value)}
                        className={`px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm ${isTouch ? "min-h-[44px]" : ""}`}
                      >
                        <option value="">选择操作</option>
                        {supportedBatchActions.users.map((action) => (
                          <option key={action} value={action}>
                            {action === "resend" ? "重发邀请" :
                             action === "cancel" ? "取消邀请" :
                             action === "remove" ? "移除成员" : action}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedUsers([])}
                      >
                        取消选择
                      </Button>
                      <Button
                        size="sm"
                        onClick={executeBatchOperation}
                        disabled={!batchOperation || batchLoading}
                        className="bg-primary hover:bg-primary/90"
                      >
                        {batchLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            执行中...
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

            {filteredUsers.length > 100 ? (
              <VirtualTable
                data={filteredUsers}
                columns={userTableColumns}
                height={containerHeight}
                itemHeight={itemHeight}
              />
            ) : (
              <MobileOptimizedTable
                data={filteredUsers}
                columns={userTableColumns}
                onRowAction={(action: string, user: UserData) => {
                  if (action === "menu") {
                    const mockEvent = { clientX: 0, clientY: 0, preventDefault: () => {} } as React.MouseEvent
                    handleUserContextMenu(mockEvent, user)
                  }
                }}
                loading={usersLoading}
                emptyMessage="暂无用户数据"
              />
            )}
          </div>
        )}

        {currentTab === "codes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">兑换码管理</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => statsCache.clear()} className="hidden sm:flex">
                  清除缓存
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadCodes()}
                  disabled={codesLoading}
                  className="hidden sm:flex"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${codesLoading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </div>
            </div>

            {/* 批量操作UI */}
            {selectedCodes.length > 0 && (
              <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">
                        已选择 {selectedCodes.length} 个兑换码
                      </span>
                      <select
                        value={batchOperation}
                        onChange={(e) => setBatchOperation(e.target.value)}
                        className={`px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm ${isTouch ? "min-h-[44px]" : ""}`}
                      >
                        <option value="">选择操作</option>
                        {supportedBatchActions.codes.map((action) => (
                          <option key={action} value={action}>
                            {action === "disable" ? "禁用兑换码" : action}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCodes([])}
                      >
                        取消选择
                      </Button>
                      <Button
                        size="sm"
                        onClick={executeBatchOperation}
                        disabled={!batchOperation || batchLoading}
                        className="bg-primary hover:bg-primary/90"
                      >
                        {batchLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            执行中...
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

            <Card id="generate-codes-section" className="border-border/40 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">生成兑换码</CardTitle>
                <CardDescription>批量生成新的兑换码</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                  <Label htmlFor="codeCount">生成数量</Label>
                  <Input
                    id="codeCount"
                    type="number"
                    min="1"
                    max="10000"
                    value={codeCount}
                    onChange={(e) => {
                      const parsed = Number.parseInt(e.target.value, 10)
                      if (Number.isNaN(parsed)) {
                        setCodeCount(0)
                      } else {
                        setCodeCount(clampCodeCount(parsed))
                      }
                    }}
                    className={`bg-background/50 border-border/60 ${isTouch ? "min-h-[44px] text-base" : ""}`}
                    disabled={generateLoading}
                  />
                </div>
                <div>
                    <Label htmlFor="codePrefix">前缀（可选）</Label>
                    <Input
                      id="codePrefix"
                      type="text"
                      placeholder="如：TEAM2024"
                      value={codePrefix}
                      onChange={(e) => setCodePrefix(e.target.value)}
                      className={`bg-background/50 border-border/60 ${isTouch ? "min-h-[44px] text-base" : ""}`}
                      disabled={generateLoading}
                      maxLength={10}
                    />
                  </div>
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                  <p>
                    当前已启用配额：{maxCodeCapacity ?? "未知"}（席位） · 活跃兑换码：{activeCodesCount ?? "未知"}
                  </p>
                  <p>
                    剩余可生成数量：
                    {remainingQuota !== null ? (
                      <span className={remainingQuota > 0 ? "text-foreground font-medium" : "text-red-600 font-medium"}>
                        {remainingQuota}
                      </span>
                    ) : (
                      "计算中"
                    )}
                    {remainingQuota !== null && remainingQuota <= 0 && "（已用尽，可清理已使用或过期的兑换码后重试）"}
                  </p>
                  {quotaLoading && <p className="text-xs text-muted-foreground">正在同步配额...</p>}
                  {quotaError && (
                    <p className="text-xs text-red-600">配额更新失败：{quotaError}</p>
                  )}
                </div>
                <Button
                  id="btn-generate-codes"
                  onClick={generateCodes}
                  disabled={
                    generateLoading ||
                    codeCount < 1 ||
                    (remainingQuota !== null && remainingQuota <= 0)
                  }
                  className={`w-full bg-primary text-primary-foreground hover:bg-primary/90 ${isTouch ? "min-h-[48px] text-base" : ""}`}
                >
                  {generateLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      生成 {codeCount} 个兑换码
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {filteredCodes.length > 100 ? (
              <VirtualTable
                data={filteredCodes}
                columns={codeTableColumns}
                onRowAction={(action: string, code: CodeData) => {
                  if (action === "menu") {
                    const mockEvent = { clientX: 0, clientY: 0, preventDefault: () => {} } as React.MouseEvent
                    handleCodeContextMenu(mockEvent, code)
                  }
                }}
                loading={codesLoading}
                emptyMessage="暂无兑换码数据"
                itemHeight={itemHeight}
                containerHeight={containerHeight}
              />
        ) : (
          <MobileOptimizedTable
            data={filteredCodes}
            columns={codeTableColumns}
            onRowAction={(action: string, code: CodeData) => {
              if (action === "menu") {
                const mockEvent = { clientX: 0, clientY: 0, preventDefault: () => {} } as React.MouseEvent
                handleCodeContextMenu(mockEvent, code)
              }
            }}
            loading={codesLoading}
            emptyMessage="暂无兑换码数据"
          />
        )}

        {(currentTab as string) === "codes-status" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">兑换码状态总览</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadCodes()}
                  disabled={codesLoading}
                  className="hidden sm:flex"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${codesLoading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </div>
            </div>

            {/* 筛选区 */}
            <div className="p-3 sm:p-4 border border-border/40 rounded-lg bg-card/30 backdrop-blur-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <Label className="text-sm">状态</Label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm ${isTouch ? "min-h-[44px]" : ""}`}
                  >
                    <option value="all">全部</option>
                    <option value="used">已使用</option>
                    <option value="unused">未使用</option>
                  </select>
                </div>
                <div>
                  <Label className="text-sm">母号</Label>
                  <select
                    value={codesStatusMother}
                    onChange={(e) => setCodesStatusMother(e.target.value)}
                    className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm ${isTouch ? "min-h-[44px]" : ""}`}
                  >
                    <option value="">全部</option>
                    {uniqueMothers.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-sm">团队</Label>
                  <select
                    value={codesStatusTeam}
                    onChange={(e) => setCodesStatusTeam(e.target.value)}
                    className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm ${isTouch ? "min-h-[44px]" : ""}`}
                  >
                    <option value="">全部</option>
                    {uniqueTeams.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-sm">批次</Label>
                  <select
                    value={codesStatusBatch}
                    onChange={(e) => setCodesStatusBatch(e.target.value)}
                    className={`w-full mt-1 px-3 py-2 rounded-md border border-border/60 bg-background/50 text-sm ${isTouch ? "min-h-[44px]" : ""}`}
                  >
                    <option value="">全部</option>
                    {uniqueBatches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <Label className="text-sm">搜索</Label>
                <Input
                  placeholder="搜索兑换码/邮箱/团队/批次"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`bg-background/50 border-border/60 mt-1 ${isTouch ? "min-h-[44px] text-base" : ""}`}
                />
              </div>
            </div>

            {filteredCodesStatus.length > 100 ? (
              <VirtualTable
                data={filteredCodesStatus}
                columns={codeTableColumns}
                onRowAction={(action: string, code: CodeData) => {
                  if (action === "menu") {
                    const mockEvent = { clientX: 0, clientY: 0, preventDefault: () => {} } as React.MouseEvent
                    handleCodeContextMenu(mockEvent, code)
                  }
                }}
                loading={codesLoading}
                emptyMessage="暂无兑换码数据"
                itemHeight={itemHeight}
                containerHeight={containerHeight}
              />
            ) : (
              <MobileOptimizedTable
                data={filteredCodesStatus}
                columns={codeTableColumns}
                onRowAction={(action: string, code: CodeData) => {
                  if (action === "menu") {
                    const mockEvent = { clientX: 0, clientY: 0, preventDefault: () => {} } as React.MouseEvent
                    handleCodeContextMenu(mockEvent, code)
                  }
                }}
                loading={codesLoading}
                emptyMessage="暂无兑换码数据"
              />
            )}

            <div className="border border-border/40 rounded-lg bg-card/50 backdrop-blur-sm overflow-hidden">
              <AdminRateLimitDashboard />
            </div>
          </div>
        )}

            {/* 生成结果预览与导出 */}
            {showGenerated && generatedCodes.length > 0 && (
              <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">已生成兑换码</CardTitle>
                    <CardDescription>共 {generatedCodes.length} 个，可一键复制或下载为 TXT</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(generatedCodes.join("\n"), "兑换码列表")}
                    >
                      <Copy className="w-4 h-4 mr-2" /> 复制全部
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadCodes}>
                      <Download className="w-4 h-4 mr-2" /> 下载TXT
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-64 overflow-auto p-3 rounded-md border border-border/40 bg-background/40">
                    <pre className="text-xs sm:text-sm leading-6 whitespace-pre-wrap break-all font-mono">
                      {generatedCodes.join("\n")}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}
      </div>
    )}

        {/* Default to overview for other tabs */}
        {currentTab === "mothers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">母号看板</h2>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setFormError(null)
                    setMotherFormState(getEmptyMotherFormState())
                    setCreateDialogOpen(true)
                  }}
                >
                  新增母号
                </Button>
                <Button variant="outline" size="sm" onClick={() => loadMothers()} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> 刷新
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mothers.map((m) => {
                const used = m.seats_used
                const total = m.seat_limit
                const pct = total > 0 ? Math.round((used / total) * 100) : 0
                return (
                  <Card key={m.id} className="border-border/40 bg-card/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="truncate" title={m.name}>{m.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${m.status === "active" ? "bg-green-500/20 text-green-600 border-green-500/30" : "bg-yellow-500/20 text-yellow-700 border-yellow-500/30"}`}>{m.status === "active" ? "活跃" : m.status}</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        座位：{used}/{total} （{pct}%）
                      </CardDescription>
                    </CardHeader>
                  <CardContent>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      团队：{m.teams.filter(t => t.is_enabled).map(t => t.team_name || t.team_id).join("，") || "无"}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-4 flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingMother(m)
                          setEditDialogOpen(true)
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(m.name, "账号名")}
                      >
                        复制名称
                      </Button>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMother(m.id)}
                    >
                      删除
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>
        )}

        {currentTab === "bulk-import" && (
          <BulkMotherImport
            onRefreshMothers={() => {
              loadMothers()
            }}
            onRefreshStats={() => {
              loadStats()
            }}
            onRefreshQuota={() => loadQuota()}
            onRefreshHistory={() => loadBulkHistory(true)}
          />
        )}

        {currentTab === "bulk-history" && (
          <div className="space-y-4">
            {bulkHistoryError && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertDescription className="text-red-600 text-sm">{bulkHistoryError}</AlertDescription>
              </Alert>
            )}
            <BulkHistoryPanel
              entries={bulkHistory}
              loading={bulkHistoryLoading}
              onRefresh={() => loadBulkHistory(true)}
            />
          </div>
        )}

        {currentTab === "overview" && (
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
                        最近检查：{new Date(serviceStatus.lastCheck).toLocaleString()}
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
                    <div className="mt-1 font-medium text-lg">
                      {stats?.pending_invites ?? 0}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">成功/失败：{stats?.successful_invites ?? 0} / {stats?.status_breakdown?.failed ?? 0}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadStats}
                    disabled={statsLoading}
                    className="bg-transparent"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${statsLoading ? "animate-spin" : ""}`} />
                    刷新统计
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentTab("codes-status")}
                  >
                    查看限流仪表板
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentTab("audit")}
                  >
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
                        已使用 {stats.used_codes} ({stats.total_codes > 0 ? ((stats.used_codes / stats.total_codes) * 100).toFixed(1) : 0}%)
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
                        最大容量 {maxCodeCapacity ?? stats.max_code_capacity ?? 0} · 活跃兑换码 {activeCodesCount ?? stats.active_codes ?? 0}
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
                <Button variant="outline" size="sm" onClick={() => setCurrentTab("audit")}>
                  查看全部
                </Button>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />
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
                            {new Date(log.created_at).toLocaleString()}
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
        )}

        {currentTab === "audit" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">审计日志</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadAuditLogs} disabled={auditLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${auditLoading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </div>
            </div>
            {auditError && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertDescription className="text-red-600">{auditError}</AlertDescription>
              </Alert>
            )}
            <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
              <CardContent className="space-y-3 pt-6">
                {auditLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-12 rounded bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : auditLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无审计记录</p>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="border border-border/40 rounded-lg p-3 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{log.actor}</span>
                        <span className="text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
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
          </div>
        )}

        {currentTab === "settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <form onSubmit={handleChangePasswordSubmit} className="space-y-3">
                  <div>
                    <Label htmlFor="oldPassword">旧密码</Label>
                    <Input
                      id="oldPassword"
                      type="password"
                      value={changePasswordForm.oldPassword}
                      onChange={(e) =>
                        setChangePasswordForm((prev) => ({ ...prev, oldPassword: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setChangePasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setChangePasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                      }
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
                  onChange={(e) => setImportCookieInput(e.target.value)}
                  placeholder="__Secure-next-auth.session-token=..."
                  className="min-h-[120px] bg-background/50 border-border/60"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setImportCookieInput("")}>
                    清空
                  </Button>
                  <Button size="sm" onClick={handleImportCookie} disabled={importCookieLoading}>
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
                    <div className="text-xs text-muted-foreground">
                      已自动填充到“新增母号”表单，可直接保存。
                    </div>
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
                <Button
                  variant="destructive"
                  onClick={handleLogoutAll}
                  disabled={logoutAllLoading}
                >
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
                  <Button variant="outline" size="sm" onClick={loadPerformanceStats} disabled={performanceLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${performanceLoading ? "animate-spin" : ""}`} />
                    刷新
                  </Button>
                  <Button variant="outline" size="sm" onClick={togglePerformanceMonitoring}>
                    {performanceStats?.enabled ? "关闭监控" : "开启监控"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={resetPerformanceStats}>
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
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : performanceStats ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <span>监控状态：</span>
                      <span className={`font-medium ${performanceStats.enabled ? "text-green-600" : "text-muted-foreground"}`}>
                        {performanceStats.enabled ? "运行中" : "已关闭"}
                      </span>
                      <span className="ml-4 text-muted-foreground">
                        累积操作：{performanceStats.total_operations}
                      </span>
                    </div>
                    {Object.entries(performanceStats.operations || {}).length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">热点操作</p>
                        <div className="space-y-2">
                          {Object.entries(performanceStats.operations || {})
                            .slice(0, 5)
                            .map(([key, value]) => (
                              <div
                                key={key}
                                className="flex items-center justify-between text-sm border border-border/30 rounded-md px-3 py-2 bg-background/40"
                              >
                                <span className="font-medium truncate pr-3">{key}</span>
                                <span className="text-muted-foreground">
                                  次数：{value?.count ?? 0}，平均 {value?.avg_time_ms?.toFixed ? value.avg_time_ms.toFixed(1) : value?.avg_time_ms ?? 0} ms
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
                          {performanceStats.slow_queries.slice(0, 5).map((item, idx) => (
                            <div key={idx} className="border border-border/30 rounded-md px-3 py-2 bg-background/40 text-sm">
                              <div className="text-muted-foreground">
                                {item.duration_ms} ms · {item.last_executed_at ? new Date(item.last_executed_at).toLocaleString() : "未知时间"}
                              </div>
                              <div className="mt-1 font-mono text-xs break-all text-foreground">
                                {item.query}
                              </div>
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
          </div>
        )}

        {!["users", "codes", "mothers", "bulk-import", "bulk-history", "overview", "audit", "settings", "codes-status"].includes(currentTab) && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">系统概览</h2>
            <div className="text-center text-muted-foreground py-8">
              <p>选择左侧菜单项查看详细信息</p>
            </div>
          </div>
        )}
      </main>

      <MobileFAB actions={fabActions} />
      <MotherFormDialog
        mode="create"
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open) {
            setMotherFormState(getEmptyMotherFormState())
            setFormError(null)
          }
        }}
        form={motherFormState}
        onFormChange={(updater) => setMotherFormState((prev) => updater(prev))}
        onSubmit={handleCreateMother}
        loading={createMotherLoading}
        error={formError}
      />
      <MotherFormDialog
        mode="edit"
        open={editDialogOpen && !!editingMother}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) {
            setEditingMother(null)
            setFormError(null)
          }
        }}
        form={motherFormState}
        onFormChange={(updater) => setMotherFormState((prev) => updater(prev))}
        onSubmit={async (data) => {
          if (!editingMother) return
          await handleUpdateMother(editingMother.id, data)
        }}
        loading={editMotherLoading}
        error={formError}
      />
    </div>
  )
}
