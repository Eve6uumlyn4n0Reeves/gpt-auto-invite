"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { RefreshCw, Copy, EyeOff, Edit, Trash2, Plus, Download } from "lucide-react"

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
  const [showGenerated, setShowGenerated] = useState(false)

  const [users, setUsers] = useState<UserData[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  const [codes, setCodes] = useState<CodeData[]>([])
  const [codesLoading, setCodesLoading] = useState(false)
  // 批量导入（母号）
  type BulkTeam = { team_id: string; team_name?: string; is_enabled?: boolean; is_default?: boolean }
  type BulkItem = { name: string; access_token: string; token_expires_at?: string | null; notes?: string | null; teams: BulkTeam[]; warnings?: string[]; valid?: boolean }
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([])
  const [bulkText, setBulkText] = useState("")
  const [bulkLoading, setBulkLoading] = useState(false)
  // 码状态视图筛选
  const [codesStatusMother, setCodesStatusMother] = useState<string>("")
  const [codesStatusTeam, setCodesStatusTeam] = useState<string>("")
  const [codesStatusBatch, setCodesStatusBatch] = useState<string>("")

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

  const [currentTab, setCurrentTab] = useState<string>("overview")

  const { isTouch } = useMobileGestures()

  const performanceMetrics = usePerformanceMonitor("AdminDashboard")
  const statsCache = useCache<StatsData>()

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300)

  const itemHeight = 60
  const containerHeight = 400
  const overscan = 5

  const handleBulkFile = async (file: File) => {
    const text = await file.text()
    let items: BulkItem[] = []
    try {
      const trimmed = text.trim()
      if (trimmed.startsWith("[")) {
        const arr = JSON.parse(trimmed)
        if (Array.isArray(arr)) items = arr
      } else {
        const lines = trimmed.split(/\r?\n/)
        for (const line of lines) {
          const s = line.trim()
          if (!s) continue
          // 优先尝试解析 JSON 行
          let parsed: any | null = null
          try { parsed = JSON.parse(s) } catch { parsed = null }
          if (parsed && typeof parsed === 'object') {
            items.push(parsed)
            continue
          }
          // 其次解析 email---token 简单格式
          if (s.includes('---')) {
            const [email, token] = s.split('---')
            const e = (email || '').trim()
            const t = (token || '').trim()
            if (e && t) {
              items.push({ name: e, access_token: t, teams: [] })
            }
          }
        }
      }
      // 规范化 teams
      items = items.map((it) => ({
        ...it,
        teams: (it.teams || []).map((t: any, idx: number) => ({
          team_id: String(t.team_id || "").trim(),
          team_name: t.team_name || t.team_id,
          is_enabled: t.is_enabled !== false,
          is_default: t.is_default === true && idx === 0,
        })),
      }))
      setBulkItems(items)
    } catch (e) {
      setError("批量文件解析失败")
    }
  }

  const handleBulkPaste = () => {
    const trimmed = (bulkText || "").trim()
    if (!trimmed) {
      setBulkItems([])
      return
    }
    const lines = trimmed.split(/\r?\n/)
    const items: BulkItem[] = []
    for (const line of lines) {
      const s = line.trim()
      if (!s) continue
      if (s.includes('---')) {
        const [email, token] = s.split('---')
        const e = (email || '').trim()
        const t = (token || '').trim()
        if (e && t) {
          items.push({ name: e, access_token: t, teams: [] })
        }
      } else {
        // 兼容空格分隔
        const parts = s.split(/\s+/)
        if (parts.length >= 2) {
          const e = parts[0]
          const t = parts.slice(1).join(' ')
          items.push({ name: e, access_token: t, teams: [] })
        }
      }
    }
    setBulkItems(items)
  }

  const bulkValidate = async () => {
    setBulkLoading(true)
    try {
      const resp = await fetch("/api/admin/mothers/batch/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bulkItems) })
      if (resp.ok) {
        const data: Array<{ index: number; valid: boolean; warnings: string[]; teams: BulkTeam[] }> = await resp.json()
        setBulkItems((prev) => {
          const copy = [...prev]
          for (const row of data) {
            if (copy[row.index]) {
              copy[row.index].valid = row.valid
              copy[row.index].warnings = row.warnings
              copy[row.index].teams = row.teams
            }
          }
          return copy
        })
      } else {
        setError("批量校验失败")
      }
    } catch {
      setError("批量校验失败")
    } finally {
      setBulkLoading(false)
    }
  }

  const bulkImport = async () => {
    setBulkLoading(true)
    try {
      const resp = await fetch("/api/admin/mothers/batch/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bulkItems) })
      if (resp.ok) {
        const data: Array<{ index: number; success: boolean; error?: string }> = await resp.json()
        const okCount = data.filter((d) => d.success).length
        setError("")
        notifications.addNotification({ type: okCount === data.length ? "success" : "warning", title: "批量导入完成", message: `成功 ${okCount} / ${data.length}` })
        // 导入成功后清空或保留失败项
        setBulkItems((prev) => prev.filter((_, i) => !data.find((d) => d.index === i && d.success)))
        loadMothers()
      } else {
        setError("批量导入失败")
      }
    } catch {
      setError("批量导入失败")
    } finally {
      setBulkLoading(false)
    }
  }

  const updateTeamName = (i: number, teamIdx: number, value: string) => {
    setBulkItems((prev) => {
      const copy = [...prev]
      if (copy[i]) {
        const teams = [...(copy[i].teams || [])]
        if (teams[teamIdx]) teams[teamIdx] = { ...teams[teamIdx], team_name: value }
        copy[i] = { ...copy[i], teams }
      }
      return copy
    })
  }

  const toggleTeamEnabled = (i: number, teamIdx: number) => {
    setBulkItems((prev) => {
      const copy = [...prev]
      const item = copy[i]
      if (item && item.teams[teamIdx]) {
        const t = item.teams[teamIdx]
        item.teams[teamIdx] = { ...t, is_enabled: !(t.is_enabled !== false) }
        copy[i] = { ...item }
      }
      return copy
    })
  }

  const setDefaultTeam = (i: number, teamIdx: number) => {
    setBulkItems((prev) => {
      const copy = [...prev]
      const item = copy[i]
      if (item) {
        const teams = item.teams.map((t, idx) => ({ ...t, is_default: idx === teamIdx }))
        copy[i] = { ...item, teams }
      }
      return copy
    })
  }

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

    // Cache is handled automatically by useCache hook based on TTL

    try {
      const response = await fetch("/api/admin/stats")
      if (response.ok) {
        const data = await response.json()
        setStats(data)
        statsCache.set("admin-stats", data) // Cache the data
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
        setShowGenerated(true)
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
        icon: <RefreshCw className="w-4 h-4" />,
        action: () => {
          // Implement resend logic
          notifications.addNotification({
            type: "info",
            title: "重发邀请",
            message: `正在为 ${user.email} 重发邀请...`,
          })
        },
        disabled: user.status === "sent",
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
                      onChange={(e) => setCodeCount(Number.parseInt(e.target.value) || 1)}
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
                <Button
                  id="btn-generate-codes"
                  onClick={generateCodes}
                  disabled={generateLoading || codeCount < 1}
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
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {currentTab === "bulk-import" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">批量导入母号</h2>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".json,.jsonl,.ndjson,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleBulkFile(f)
                  }}
                  className="text-sm"
                />
                <Button variant="outline" size="sm" onClick={() => setBulkItems([])}>
                  清空
                </Button>
                <Button variant="outline" size="sm" onClick={bulkValidate} disabled={bulkLoading || bulkItems.length === 0}>
                  校验
                </Button>
                <Button onClick={bulkImport} disabled={bulkLoading || bulkItems.length === 0}>
                  导入
                </Button>
              </div>
            </div>

            <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">从文本粘贴</CardTitle>
                <CardDescription>每行一条，格式：邮箱---accessToken（也支持空格分隔）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="w-full min-h-[140px] p-3 rounded border border-border/40 bg-background/50 text-sm font-mono"
                  placeholder={`user1@example.com---token1\nuser2@example.com---token2`}
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setBulkText(""); setBulkItems([]) }}>清空</Button>
                  <Button size="sm" onClick={handleBulkPaste}>解析到列表</Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {bulkItems.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">可选择批量文件（JSON/JSONL/文本）或在上方粘贴“邮箱---accessToken”</div>
              ) : (
                bulkItems.map((it, i) => (
                  <Card key={i} className={`border ${it.valid === false ? 'border-red-500/50' : 'border-border/40'} bg-card/50`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{it.name || '(未命名)'}</CardTitle>
                      {it.warnings && it.warnings.length > 0 && (
                        <CardDescription className="text-xs text-yellow-600">{it.warnings.join('；')}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(it.teams || []).map((t, idx) => (
                          <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                            <div className="text-xs sm:text-sm text-muted-foreground">Team ID</div>
                            <div className="sm:col-span-1">
                              <code className="text-xs sm:text-sm">{t.team_id}</code>
                            </div>
                            <div className="text-xs sm:text-sm text-muted-foreground">Team 名称</div>
                            <div className="sm:col-span-1">
                              <Input value={t.team_name || ''} onChange={(e) => updateTeamName(i, idx, e.target.value)} />
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant={t.is_default ? 'secondary' : 'outline'} onClick={() => setDefaultTeam(i, idx)}>
                                {t.is_default ? '默认' : '设为默认'}
                              </Button>
                              <Button size="sm" variant={t.is_enabled !== false ? 'secondary' : 'outline'} onClick={() => toggleTeamEnabled(i, idx)}>
                                {t.is_enabled !== false ? '启用' : '禁用'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {!["users", "codes", "mothers", "bulk-import"].includes(currentTab) && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">系统概览</h2>
            <div className="text-center text-muted-foreground py-8">
              <p>选择左侧菜单项查看详细信息</p>
            </div>
          </div>
        )}
      </main>

      <MobileFAB actions={fabActions} />
    </div>
  )
}
