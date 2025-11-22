'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { BulkMotherEntry, DuplicateInfo } from '../types'

interface BulkImportEntryCardProps {
  entry: BulkMotherEntry
  index: number
  duplicateInfo: DuplicateInfo
  onUpdateEntryField: (entryId: string, patch: Partial<BulkMotherEntry>) => void
  onRemoveEntry: (entryId: string) => void
  onAddTeam: (entryId: string) => void
  onUpdateTeamField: (
    entryId: string,
    teamIndex: number,
    field: 'team_id' | 'team_name' | 'is_enabled' | 'is_default',
    value: string | boolean,
  ) => void
  onRemoveTeam: (entryId: string, teamIndex: number) => void
}

export function BulkImportEntryCard({
  entry,
  index,
  duplicateInfo,
  onUpdateEntryField,
  onRemoveEntry,
  onAddTeam,
  onUpdateTeamField,
  onRemoveTeam,
}: BulkImportEntryCardProps) {
  const isDuplicateName = duplicateInfo.duplicateNames.has(entry.name.trim().toLowerCase())
  const isDuplicateToken = duplicateInfo.duplicateTokens.has(entry.access_token.trim().toLowerCase())

  return (
    <Card
      className={`border ${
        entry.status === 'failed'
          ? 'border-red-400/60'
          : entry.valid === false
            ? 'border-yellow-500/60'
            : 'border-border/50'
      } bg-card/70`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">
            条目 #{index + 1}
            {entry.status === 'imported' && (
              <Badge variant="secondary" className="ml-3 bg-green-500/10 text-green-600">
                已导入
              </Badge>
            )}
            {entry.status === 'failed' && (
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
            来源：{entry.source === 'manual' ? '粘贴' : '上传'} · 最近编辑：
            {new Date(entry.updatedAt).toLocaleTimeString()}
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onRemoveEntry(entry.id)}>
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
              onChange={(event) => onUpdateEntryField(entry.id, { name: event.target.value })}
              className={isDuplicateName ? 'border-orange-500/60' : ''}
            />
          </div>
          <div className="space-y-2">
            <Label>Access Token</Label>
            <Input
              value={entry.access_token}
              placeholder="Access Token"
              onChange={(event) => onUpdateEntryField(entry.id, { access_token: event.target.value })}
              className={isDuplicateToken ? 'border-orange-500/60' : ''}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Token 过期时间 (可选)</Label>
            <Input
              type="datetime-local"
              value={entry.token_expires_at ?? ''}
              onChange={(event) =>
                onUpdateEntryField(entry.id, {
                  token_expires_at: event.target.value ? event.target.value : null,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>备注 (可选)</Label>
            <Input
              value={entry.notes ?? ''}
              onChange={(event) => onUpdateEntryField(entry.id, { notes: event.target.value })}
              placeholder="内部备注或说明"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>团队设置</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAddTeam(entry.id)}
              className="flex items-center gap-2"
            >
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
                        onUpdateTeamField(entry.id, teamIndex, 'team_id', event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Team 名称</Label>
                    <Input
                      value={team.team_name ?? ''}
                      placeholder="展示名称（可选）"
                      onChange={(event) =>
                        onUpdateTeamField(entry.id, teamIndex, 'team_name', event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={team.is_enabled}
                      onCheckedChange={(value) =>
                        onUpdateTeamField(entry.id, teamIndex, 'is_enabled', value)
                      }
                    />
                    <span>{team.is_enabled ? '已启用' : '禁用'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={team.is_default}
                      onCheckedChange={(value) =>
                        onUpdateTeamField(entry.id, teamIndex, 'is_default', value)
                      }
                    />
                    <span>{team.is_default ? '默认团队' : '设为默认'}</span>
                  </div>
                  {entry.teams.length > 1 && (
                    <Button
                      variant='ghost'
                      size="sm"
                      onClick={() => onRemoveTeam(entry.id, teamIndex)}
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
  )
}
