'use client'

import { useCallback, useMemo, useState } from 'react'
import type { TeamFormInput } from '@/types/admin'
import { useNotifications } from '@/components/notification-system'
import { parseJsonLines, parsePlainText } from './utils/parsing'
import {
  analyseDuplicates,
  createEntry,
  emptyTeam,
  serializeForApi,
} from './utils/entries'
import type {
  BulkMotherEntry,
  BulkMotherImportProps,
  DuplicateInfo,
  ImportStage,
  ImportSummary,
} from './types'

interface UseBulkImportWorkflowOptions extends BulkMotherImportProps {}

interface UseBulkImportWorkflowReturn {
  stage: ImportStage
  entries: BulkMotherEntry[]
  textInput: string
  setTextInput: (value: string) => void
  delimiter: string
  setDelimiter: (value: string) => void
  loading: boolean
  importSummary: ImportSummary | null
  lastUploadedFile: string | null
  error: string | null
  duplicateInfo: DuplicateInfo
  validEntries: BulkMotherEntry[]
  invalidEntries: BulkMotherEntry[]
  failedEntries: BulkMotherEntry[]
  anyDuplicates: boolean
  resetWorkflow: () => void
  handleParseText: () => void
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  updateEntryField: (entryId: string, patch: Partial<BulkMotherEntry>) => void
  removeEntry: (entryId: string) => void
  addTeamToEntry: (entryId: string) => void
  updateTeamField: (entryId: string, teamIndex: number, field: keyof TeamFormInput, value: string | boolean) => void
  removeTeamFromEntry: (entryId: string, teamIndex: number) => void
  validateEntries: () => Promise<void>
  importEntries: () => Promise<void>
}

export const useBulkImportWorkflow = ({
  onRefreshMothers,
  onRefreshStats,
  onRefreshQuota,
  onRefreshHistory,
}: UseBulkImportWorkflowOptions): UseBulkImportWorkflowReturn => {
  const notifications = useNotifications()

  const [stage, setStage] = useState<ImportStage>('idle')
  const [entries, setEntries] = useState<BulkMotherEntry[]>([])
  const [textInput, setTextInput] = useState('')
  const [delimiter, setDelimiter] = useState('---')
  const [loading, setLoading] = useState(false)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [lastUploadedFile, setLastUploadedFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const duplicateInfo = useMemo<DuplicateInfo>(() => analyseDuplicates(entries), [entries])

  const validEntries = useMemo(() => entries.filter((entry) => entry.valid !== false && entry.status !== 'invalid'), [entries])

  const invalidEntries = useMemo(
    () => entries.filter((entry) => entry.valid === false || entry.status === 'invalid'),
    [entries],
  )

  const failedEntries = useMemo(() => entries.filter((entry) => entry.status === 'failed'), [entries])

  const anyDuplicates =
    duplicateInfo.duplicateNames.size > 0 || duplicateInfo.duplicateTokens.size > 0

  const resetWorkflow = useCallback(() => {
    setStage('idle')
    setEntries([])
    setTextInput('')
    setError(null)
    setImportSummary(null)
    setLastUploadedFile(null)
  }, [])

  const applyParsedEntries = useCallback((parsed: BulkMotherEntry[], source: 'manual' | 'upload') => {
    if (!parsed.length) {
      setError('未解析到任何母号，请检查内容格式')
      return
    }

    setEntries(
      parsed.map((entry, index) => ({
        ...entry,
        source,
        updatedAt: Date.now() + index,
        status: entry.status === 'invalid' ? 'invalid' : 'draft',
        valid: entry.valid ?? null,
        warnings: entry.warnings ?? [],
      })),
    )
    setStage('preview')
    setError(null)
    setImportSummary(null)
  }, [])

  const handleParseText = useCallback(() => {
    const trimmed = textInput.trim()
    if (!trimmed) {
      setError('请输入或粘贴母号列表')
      return
    }

    try {
      const parsed = parsePlainText(trimmed, delimiter.trim(), 'manual')
      applyParsedEntries(parsed, 'manual')
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析文本失败')
    }
  }, [applyParsedEntries, delimiter, textInput])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      try {
        const content = await file.text()
        const trimmed = content.trim()
        let parsed: BulkMotherEntry[] = []

        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          const json = JSON.parse(trimmed)
          if (Array.isArray(json)) {
            parsed = json.map((item) => {
              const data = item as Record<string, unknown>
              const rawTeams = Array.isArray(data.teams) ? (data.teams as TeamFormInput[]) : []
              const tokenExpiresRaw = data.token_expires_at
              return createEntry({
                source: 'upload',
                name: typeof data.name === 'string' ? data.name.trim() : '',
                access_token: typeof data.access_token === 'string' ? data.access_token.trim() : '',
                token_expires_at: typeof tokenExpiresRaw === 'string' ? tokenExpiresRaw : null,
                notes: typeof data.notes === 'string' ? data.notes : '',
                teams:
                  rawTeams.length > 0
                    ? rawTeams.map((team, idx) => ({
                        team_id: String(team.team_id ?? '').trim(),
                        team_name: team.team_name ?? '',
                        is_enabled: team.is_enabled !== false,
                        is_default: idx === 0 ? Boolean(team.is_default) : Boolean(team.is_default && idx === 0),
                      }))
                    : [emptyTeam()],
              })
            })
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
          parsed = parsePlainText(trimmed, delimiter.trim(), 'upload')
        }

        applyParsedEntries(parsed, 'upload')
        setLastUploadedFile(file.name)
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析文件失败')
      } finally {
        event.target.value = ''
      }
    },
    [applyParsedEntries, delimiter],
  )

  const updateEntry = useCallback(
    (entryId: string, updater: (entry: BulkMotherEntry) => BulkMotherEntry) => {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? updater({
                ...entry,
                updatedAt: Date.now(),
                status: entry.status === 'imported' ? 'imported' : 'draft',
              })
            : entry,
        ),
      )
    },
    [],
  )

  const updateEntryField = useCallback(
    (entryId: string, patch: Partial<BulkMotherEntry>) => {
      updateEntry(entryId, (entry) => ({
        ...entry,
        ...patch,
      }))
    },
    [updateEntry],
  )

  const removeEntry = useCallback((entryId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId))
  }, [])

  const addTeamToEntry = useCallback(
    (entryId: string) => {
      updateEntry(entryId, (entry) => ({
        ...entry,
        teams: [...entry.teams, emptyTeam()],
      }))
    },
    [updateEntry],
  )

  const updateTeamField = useCallback(
    (entryId: string, teamIndex: number, field: keyof TeamFormInput, value: string | boolean) => {
      updateEntry(entryId, (entry) => {
        const nextTeams = entry.teams.map((team, index) =>
          index === teamIndex ? { ...team, [field]: value } : team,
        )

        if (field === 'is_default' && value === true) {
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
      const response = await fetch('/api/admin/mothers/batch/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entries.map(serializeForApi)),
      })

      const data: Array<{ index: number; valid: boolean; warnings: string[]; teams: TeamFormInput[] }> =
        await response.json()

      if (!response.ok) {
        throw new Error('校验失败，请稍后重试')
      }

      setEntries((prev) =>
        prev.map((entry, index) => {
          const result = data[index]
          if (!result) return entry
          return {
            ...entry,
            valid: result.valid,
            warnings: result.warnings || [],
            status: result.valid ? 'validated' : 'invalid',
            teams:
              result.teams && result.teams.length > 0
                ? result.teams.map((team, idx) => ({
                    team_id: team.team_id?.trim() || '',
                    team_name: team.team_name || '',
                    is_enabled: team.is_enabled !== false,
                    is_default: Boolean(team.is_default && idx === 0),
                  }))
                : entry.teams,
          }
        }),
      )

      setStage('validated')
      notifications.addNotification({
        type: 'success',
        title: '校验完成',
        message: '条目已校验，可继续导入',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '校验失败')
    } finally {
      setLoading(false)
    }
  }, [entries, notifications])

  const importEntries = useCallback(async () => {
    if (!entries.length) return

    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/mothers/batch/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entries.map(serializeForApi)),
      })

      const data: Array<{ index: number; success: boolean; error?: string }> = await response.json()

      if (!response.ok) {
        throw new Error('批量导入失败，请稍后重试')
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
            status: result.success ? 'imported' : 'failed',
            error: result.error,
          }
        }),
      )

      setImportSummary({ success, failed })
      setStage('completed')

      notifications.addNotification({
        type: failed > 0 ? 'warning' : 'success',
        title: '导入完成',
        message: failed > 0 ? `成功 ${success} 条，失败 ${failed} 条` : `成功导入 ${success} 条母号`,
      })

      onRefreshMothers()
      onRefreshStats()
      onRefreshQuota?.()
      onRefreshHistory?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量导入失败')
    } finally {
      setLoading(false)
    }
  }, [entries, notifications, onRefreshHistory, onRefreshMothers, onRefreshQuota, onRefreshStats])

  return {
    stage,
    entries,
    textInput,
    setTextInput,
    delimiter,
    setDelimiter,
    loading,
    importSummary,
    lastUploadedFile,
    error,
    duplicateInfo,
    validEntries,
    invalidEntries,
    failedEntries,
    anyDuplicates,
    resetWorkflow,
    handleParseText,
    handleFileUpload,
    updateEntryField,
    removeEntry,
    addTeamToEntry,
    updateTeamField,
    removeTeamFromEntry,
    validateEntries,
    importEntries,
  }
}
