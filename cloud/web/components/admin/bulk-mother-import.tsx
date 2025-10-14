'use client'

import { useCallback, useMemo, useState } from "react"
import { Upload, Loader2, CheckCircle2, AlertTriangle, Trash2, Plus, RefreshCw, FileJson } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { useNotifications } from "@/components/notification-system"
import { TeamFormInput } from "@/types/admin"

type ImportStage = "idle" | "preview" | "validated" | "completed"

type BulkEntryStatus = "draft" | "validated" | "invalid" | "imported" | "failed"

interface BulkMotherEntry {
  id: string
  source: "manual" | "upload"
  name: string
  access_token: string
  token_expires_at?: string | null
  notes?: string
  teams: TeamFormInput[]
  warnings: string[]
  valid: boolean | null
  status: BulkEntryStatus
  error?: string
  updatedAt: number
}

interface BulkMotherImportProps {
  onRefreshMothers: () => void
  onRefreshStats: () => void
  onRefreshQuota?: () => void
  onRefreshHistory?: () => void
}

const emptyTeam = (): TeamFormInput => ({
  team_id: "",
  team_name: "",
  is_enabled: true,
  is_default: false,
})

const generateId = () =>
  typeof globalThis !== "undefined" && globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `mother_${Math.random().toString(36).slice(2, 10)}`

const createEntry = (overrides?: Partial<BulkMotherEntry>): BulkMotherEntry => ({
  id: generateId(),
  source: "manual",
  name: "",
  access_token: "",
  token_expires_at: null,
  notes: "",
  teams: [emptyTeam()],
  warnings: [],
  valid: null,
  status: "draft",
  updatedAt: Date.now(),
  ...overrides,
})

const serializeForApi = (entry: BulkMotherEntry) => ({
  name: entry.name.trim(),
  access_token: entry.access_token.trim(),
  token_expires_at: entry.token_expires_at ? entry.token_expires_at : null,
  notes: entry.notes?.trim() || null,
  teams: entry.teams
    .filter((team) => team.team_id.trim().length > 0)
    .map((team, index) => ({
      team_id: team.team_id.trim(),
      team_name: team.team_name?.trim() || null,
      is_enabled: Boolean(team.is_enabled),
      is_default: Boolean(team.is_default && index === 0),
    })),
})

const parsePlainText = (text: string, delimiter: string, source: "manual" | "upload" = "manual") => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.map((line) => {
    let name = ""
    let token = ""
    let notes: string | undefined

    if (delimiter && line.includes(delimiter)) {
      const parts = line.split(delimiter)
      name = (parts[0] || "").trim()
      token = (parts[1] || "").trim()
      notes = parts.slice(2).join(delimiter).trim() || undefined
    } else {
      const parts = line.split(/\s+/)
      name = (parts[0] || "").trim()
      token = parts.slice(1).join(" ").trim()
    }

    return createEntry({
      source,
      name,
      access_token: token,
      notes,
    })
  })
}

const parseJsonLines = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const entries: BulkMotherEntry[] = []

  for (const line of lines) {
    try {
      const data = JSON.parse(line)
      entries.push(
        createEntry({
          source: "upload",
          name: (data.name || "").trim(),
          access_token: (data.access_token || "").trim(),
          token_expires_at: data.token_expires_at || null,
          notes: data.notes || "",
          teams: Array.isArray(data.teams) && data.teams.length > 0
            ? data.teams.map((team: TeamFormInput, index: number) => ({
                team_id: String(team.team_id ?? "").trim(),
                team_name: team.team_name ?? "",
                is_enabled: team.is_enabled !== false,
                is_default: index === 0 ? Boolean(team.is_default) : Boolean(team.is_default && index === 0),
              }))
            : [emptyTeam()],
        }),
      )
    } catch (error) {
      entries.push(
        createEntry({
          source: "upload",
          name: "",
          access_token: "",
          notes: "",
          warnings: [`JSON 解析失败: ${(error as Error).message}`],
          valid: false,
          status: "invalid",
        }),
      )
    }
  }

  return entries
}

const analyseDuplicates = (entries: BulkMotherEntry[]) => {
  const byName = new Map<string, number>()
  const byToken = new Map<string, number>()

  entries.forEach((entry) => {
    const nameKey = entry.name.trim().toLowerCase()
    const tokenKey = entry.access_token.trim().toLowerCase()

    if (nameKey) {
      byName.set(nameKey, (byName.get(nameKey) || 0) + 1)
    }

    if (tokenKey) {
      byToken.set(tokenKey, (byToken.get(tokenKey) || 0) + 1)
    }
  })

  const duplicateNames = new Set(
    Array.from(byName.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  )
  const duplicateTokens = new Set(
    Array.from(byToken.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  )

  return { duplicateNames, duplicateTokens }
}

const downloadAsJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function BulkMotherImport({ onRefreshMothers, onRefreshStats, onRefreshQuota, onRefreshHistory }: BulkMotherImportProps) {
  const notifications = useNotifications()
  const [stage, setStage] = useState<ImportStage>("idle")
  const [entries, setEntries] = useState<BulkMotherEntry[]>([])
  const [textInput, setTextInput] = useState("")
  const [delimiter, setDelimiter] = useState("---")
  const [loading, setLoading] = useState(false)
  const [importSummary, setImportSummary] = useState<{ success: number; failed: number } | null>(null)
  const [lastUploadedFile, setLastUploadedFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const duplicateInfo = useMemo(() => analyseDuplicates(entries), [entries])

  const validEntries = useMemo(
    () => entries.filter((entry) => entry.valid !== false && entry.status !== "invalid"),
    [entries],
  )

  const invalidEntries = useMemo(
    () => entries.filter((entry) => entry.valid === false || entry.status === "invalid"),
    [entries],
  )

  const failedEntries = useMemo(
    () => entries.filter((entry) => entry.status === "failed"),
    [entries],
  )

  const resetWorkflow = useCallback(() => {
    setStage("idle")
    setEntries([])
    setTextInput("")
    setError(null)
    setImportSummary(null)
    setLastUploadedFile(null)
  }, [])

  const handleParseEntries = useCallback(
    (parsedEntries: BulkMotherEntry[], source: "manual" | "upload") => {
      if (!parsedEntries.length) {
        setError("未解析到任何母号，请检查内容格式")
        return
      }

      setEntries(
        parsedEntries.map((entry, index) => ({
          ...entry,
          source,
          updatedAt: Date.now() + index,
          status: "draft",
          valid: entry.valid ?? null,
          warnings: entry.warnings ?? [],
        })),
      )
      setStage("preview")
      setError(null)
    },
    [],
  )

  const handleParseText = useCallback(() => {
    const trimmed = textInput.trim()
    if (!trimmed) {
      setError("请输入或粘贴母号列表")
      return
    }
    try {
      const parsed = parsePlainText(trimmed, delimiter.trim(), "manual")
      handleParseEntries(parsed, "manual")
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析文本失败")
    }
  }, [textInput, delimiter, handleParseEntries])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      try {
        const content = await file.text()
        const trimmed = content.trim()
        let parsed: BulkMotherEntry[] = []

        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          const json = JSON.parse(trimmed)
          if (Array.isArray(json)) {
            parsed = json.map((item) =>
              createEntry({
                source: "upload",
                name: (item.name || "").trim(),
                access_token: (item.access_token || "").trim(),
                token_expires_at: item.token_expires_at || null,
                notes: item.notes || "",
                teams:
                  Array.isArray(item.teams) && item.teams.length > 0
                    ? item.teams.map((team: TeamFormInput, index: number) => ({
                        team_id: String(team.team_id ?? "").trim(),
                        team_name: team.team_name ?? "",
                        is_enabled: team.is_enabled !== false,
                        is_default:
                          index === 0 ? Boolean(team.is_default) : Boolean(team.is_default && index === 0),
                      }))
                    : [emptyTeam()],
              }),
            )
          } else {
            parsed = parseJsonLines(trimmed)
          }
        } else {
          parsed = parseJsonLines(trimmed)
        }

        if (
          parsed.length === 0 ||
          parsed.every((entry) => !entry.name && !entry.access_token && entry.warnings.length > 0)
        ) {
          parsed = parsePlainText(trimmed, delimiter.trim(), "upload")
        }

        handleParseEntries(parsed, "upload")
        setLastUploadedFile(file.name)
      } catch (err) {
        setError(err instanceof Error ? err.message : "解析文件失败")
      } finally {
        event.target.value = ""
      }
    },
    [handleParseEntries, delimiter],
  )

  const updateEntry = useCallback(
    (entryId: string, updater: (entry: BulkMotherEntry) => BulkMotherEntry) => {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? updater({
                ...entry,
                updatedAt: Date.now(),
                status: entry.status === "imported" ? "imported" : "draft",
              })
            : entry,
        ),
      )
    },
    [],
  )

  const removeEntry = useCallback((entryId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId))
  }, [])

  const addTeamToEntry = useCallback((entryId: string) => {
    updateEntry(entryId, (entry) => ({
      ...entry,
      teams: [...entry.teams, emptyTeam()],
    }))
  }, [updateEntry])

  const updateTeamField = useCallback(
    (entryId: string, teamIndex: number, field: keyof TeamFormInput, value: string | boolean) => {
      updateEntry(entryId, (entry) => {
        const nextTeams = entry.teams.map((team, index) =>
          index === teamIndex ? { ...team, [field]: value } : team,
        )

        if (field === "is_default" && value === true) {
          return {
            ...entry,
            teams: nextTeams.map((team, index) => ({
              ...team,
              is_default: index === teamIndex,
            })),
          }
        }

        return { ...entry, teams: nextTeams }
      })
    },
    [updateEntry],
  )

  const removeTeamFromEntry = useCallback(
    (entryId: string, teamIndex: number) => {
      updateEntry(entryId, (entry) => {
        if (entry.teams.length <= 1) return entry
        const nextTeams = entry.teams.filter((_, index) => index !== teamIndex)
        if (!nextTeams.some((team) => team.is_default)) {
          nextTeams[0].is_default = true
        }
        return { ...entry, teams: nextTeams }
      })
    },
    [updateEntry],
  )

  const validateEntries = useCallback(async () => {
    if (!entries.length) return

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/mothers/batch/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entries.map(serializeForApi)),
      })

      const data: Array<{ index: number; valid: boolean; warnings: string[]; teams: TeamFormInput[] }> =
        await response.json()

      if (!response.ok) {
        throw new Error("校验失败，请稍后重试")
      }

      setEntries((prev) =>
        prev.map((entry, index) => {
          const result = data[index]
          if (!result) return entry
          return {
            ...entry,
            valid: result.valid,
            warnings: result.warnings || [],
            status: result.valid ? "validated" : "invalid",
            teams:
              result.teams && result.teams.length > 0
                ? result.teams.map((team, idx) => ({
                    team_id: team.team_id?.trim() || "",
                    team_name: team.team_name || "",
                    is_enabled: team.is_enabled !== false,
                    is_default: Boolean(team.is_default && idx === 0),
                  }))
                : entry.teams,
          }
        }),
      )

      setStage("validated")
      notifications.addNotification({
        type: "success",
        title: "校验完成",
        message: "条目已校验，可继续导入",
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "校验失败")
    } finally {
      setLoading(false)
    }
  }, [entries, notifications])

  const importEntries = useCallback(async () => {
    if (!entries.length) return

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/mothers/batch/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entries.map(serializeForApi)),
      })

      const data: Array<{ index: number; success: boolean; error?: string }> = await response.json()

      if (!response.ok) {
        throw new Error("批量导入失败，请稍后重试")
      }

      let success = 0
      let failed = 0
      setEntries((prev) =>
        prev.map((entry, index) => {
          const result = data[index]
          if (!result) return entry
          if (result.success) success += 1
          else failed += 1
          return {
            ...entry,
            status: result.success ? "imported" : "failed",
            error: result.error,
          }
        }),
      )

      setImportSummary({ success, failed })
      setStage("completed")

      notifications.addNotification({
        type: failed > 0 ? "warning" : "success",
        title: "导入完成",
        message: failed > 0 ? `成功 ${success} 条，失败 ${failed} 条` : `成功导入 ${success} 条母号`,
      })

      onRefreshMothers()
      onRefreshStats()
      onRefreshQuota?.()
      onRefreshHistory?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量导入失败")
    } finally {
      setLoading(false)
    }
  }, [entries, notifications, onRefreshMothers, onRefreshStats])

  const anyDuplicates = duplicateInfo.duplicateNames.size > 0 || duplicateInfo.duplicateTokens.size > 0

  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-semibold">母号批量导入</CardTitle>
        <CardDescription>
          通过粘贴文本或上传 JSON/JSONL 文件，支持预览、校验和批量导入，过程中的错误条目可在导入前后再次编辑或导出。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-text">粘贴母号列表</Label>
              <Textarea
                id="bulk-text"
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                placeholder={`示例：\nuser1@example.com---token1\nuser2@example.com---token2---备注信息`}
                className="min-h-[160px] bg-background/60 font-mono text-sm"
              />
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Label htmlFor="bulk-delimiter" className="text-xs">
                    分隔符
                  </Label>
                  <Input
                    id="bulk-delimiter"
                    value={delimiter}
                    onChange={(event) => setDelimiter(event.target.value)}
                    className="h-8 w-24 bg-background/60"
                  />
                </div>
                <span>默认使用 "---" 拆分邮箱与 access token，支持追加备注。</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleParseText} disabled={loading}>
                  解析文本
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setTextInput("")}>
                  清空
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>上传 JSON / JSONL</Label>
              <div className="rounded-lg border border-dashed border-border/50 bg-background/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">支持 JSON 数组或 JSON Lines</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {lastUploadedFile ? `已上传：${lastUploadedFile}` : "字段需包含 name、access_token、teams 等信息"}
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-background/80">
                    <Upload className="h-4 w-4" />
                    选择文件
                    <input type="file" accept=".json,.jsonl,.ndjson,.txt" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertDescription className="text-red-600 text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {entries.length > 0 && (
          <section className="space-y-4">
            <div className="rounded-lg border border-border/50 bg-background/40 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">条目总数</p>
                  <p className="text-lg font-semibold">{entries.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">待导入</p>
                  <p className="text-lg font-semibold text-primary">{validEntries.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">校验未通过</p>
                  <p className="text-lg font-semibold text-yellow-500">{invalidEntries.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">检测到重复</p>
                  <p className="text-lg font-semibold text-orange-500">
                    {duplicateInfo.duplicateNames.size + duplicateInfo.duplicateTokens.size}
                  </p>
                </div>
              </div>
              {anyDuplicates && (
                <div className="mt-3 rounded-md border border-orange-400/40 bg-orange-400/10 p-3 text-xs text-orange-700">
                  <p className="font-medium">检测到重复项：</p>
                  {duplicateInfo.duplicateNames.size > 0 && (
                    <p>• 重复邮箱：{duplicateInfo.duplicateNames.size} 组</p>
                  )}
                  {duplicateInfo.duplicateTokens.size > 0 && (
                    <p>• 重复 Access Token：{duplicateInfo.duplicateTokens.size} 组</p>
                  )}
                  <p>请在校验前确认是否需要合并或删除重复条目。</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={validateEntries}
                disabled={loading || entries.length === 0}
                className="flex items-center gap-2"
              >
                {loading && stage !== "completed" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    校验中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    校验条目
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={importEntries}
                disabled={loading || validEntries.length === 0 || stage !== "validated"}
                className="flex items-center gap-2"
              >
                {loading && stage === "validated" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    执行导入
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={resetWorkflow} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                重置流程
              </Button>
              {failedEntries.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadAsJson(`母号导入失败-${Date.now()}.json`, failedEntries)}
                  className="flex items-center gap-2"
                >
                  <FileJson className="h-4 w-4" />
                  导出失败条目
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {entries.map((entry, index) => (
                <Card
                  key={entry.id}
                  className={`border ${entry.status === "failed" ? "border-red-400/60" : entry.valid === false ? "border-yellow-500/60" : "border-border/50"} bg-card/70`}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base font-semibold">
                        条目 #{index + 1}
                        {entry.status === "imported" && (
                          <Badge variant="secondary" className="ml-3 bg-green-500/10 text-green-600">
                            已导入
                          </Badge>
                        )}
                        {entry.status === "failed" && (
                          <Badge variant="destructive" className="ml-3">
                            导入失败
                          </Badge>
                        )}
                        {entry.valid === false && (
                          <Badge variant="outline" className="ml-3 text-yellow-600 border-yellow-500/50">
                            校验未通过
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        来源：{entry.source === "manual" ? "粘贴" : "上传"} · 最近编辑：{new Date(entry.updatedAt).toLocaleTimeString()}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeEntry(entry.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>母号标识</Label>
                        <Input
                          value={entry.name}
                          placeholder="邮箱或唯一标识"
                          onChange={(event) => updateEntry(entry.id, (prev) => ({ ...prev, name: event.target.value }))}
                          className={duplicateInfo.duplicateNames.has(entry.name.trim().toLowerCase()) ? "border-orange-500/60" : ""}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Access Token</Label>
                        <Input
                          value={entry.access_token}
                          placeholder="Access Token"
                          onChange={(event) =>
                            updateEntry(entry.id, (prev) => ({ ...prev, access_token: event.target.value }))
                          }
                          className={duplicateInfo.duplicateTokens.has(entry.access_token.trim().toLowerCase()) ? "border-orange-500/60" : ""}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Token 过期时间 (可选)</Label>
                        <Input
                          type="datetime-local"
                          value={entry.token_expires_at ?? ""}
                          onChange={(event) =>
                            updateEntry(entry.id, (prev) => ({
                              ...prev,
                              token_expires_at: event.target.value ? event.target.value : null,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>备注 (可选)</Label>
                        <Input
                          value={entry.notes ?? ""}
                          onChange={(event) => updateEntry(entry.id, (prev) => ({ ...prev, notes: event.target.value }))}
                          placeholder="内部备注或说明"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>团队设置</Label>
                        <Button size="sm" variant="outline" onClick={() => addTeamToEntry(entry.id)} className="flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          添加团队
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {entry.teams.map((team, teamIndex) => (
                          <div
                            key={`${entry.id}-team-${teamIndex}`}
                            className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-3"
                          >
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label>Team ID</Label>
                                <Input
                                  value={team.team_id}
                                  placeholder="team-id"
                                  onChange={(event) =>
                                    updateTeamField(entry.id, teamIndex, "team_id", event.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Team 名称</Label>
                                <Input
                                  value={team.team_name ?? ""}
                                  placeholder="展示名称（可选）"
                                  onChange={(event) =>
                                    updateTeamField(entry.id, teamIndex, "team_name", event.target.value)
                                  }
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={team.is_enabled}
                                  onCheckedChange={(value) => updateTeamField(entry.id, teamIndex, "is_enabled", value)}
                                />
                                <span>{team.is_enabled ? "已启用" : "禁用"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={team.is_default}
                                  onCheckedChange={(value) => updateTeamField(entry.id, teamIndex, "is_default", value)}
                                />
                                <span>{team.is_default ? "默认团队" : "设为默认"}</span>
                              </div>
                              {entry.teams.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeTeamFromEntry(entry.id, teamIndex)}
                                >
                                  删除
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {entry.warnings.length > 0 && (
                      <div className="rounded-md border border-yellow-400/50 bg-yellow-400/10 p-3 text-xs text-yellow-700">
                        <p className="font-medium">警告 / 提示</p>
                        <ul className="mt-1 space-y-1 list-disc list-inside">
                          {entry.warnings.map((warning, warningIndex) => (
                            <li key={warningIndex}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {entry.error && (
                      <div className="rounded-md border border-red-400/50 bg-red-400/10 p-3 text-xs text-red-600">
                        导入失败：{entry.error}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {importSummary && (
          <div className="rounded-lg border border-border/50 bg-background/40 p-4">
            <p className="text-sm font-medium">导入结果</p>
            <div className="mt-2 text-xs text-muted-foreground space-y-1">
              <p>成功导入：{importSummary.success} 条</p>
              <p>导入失败：{importSummary.failed} 条</p>
              <p>如需重试，可修改失败条目或导出后另行处理。</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
