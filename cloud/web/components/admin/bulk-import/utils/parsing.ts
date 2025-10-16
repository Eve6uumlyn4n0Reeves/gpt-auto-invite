import type { TeamFormInput } from '@/types/admin'
import { createEntry, emptyTeam } from './entries'
import type { BulkMotherEntry } from '../types'

export const parsePlainText = (
  text: string,
  delimiter: string,
  source: 'manual' | 'upload' = 'manual',
): BulkMotherEntry[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.map((line) => {
    let name = ''
    let token = ''
    let notes: string | undefined

    if (delimiter && line.includes(delimiter)) {
      const parts = line.split(delimiter)
      name = (parts[0] || '').trim()
      token = (parts[1] || '').trim()
      notes = parts.slice(2).join(delimiter).trim() || undefined
    } else {
      const parts = line.split(/\s+/)
      name = (parts[0] || '').trim()
      token = parts.slice(1).join(' ').trim()
    }

    return createEntry({
      source,
      name,
      access_token: token,
      notes,
    })
  })
}

export const parseJsonLines = (text: string): BulkMotherEntry[] => {
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
          source: 'upload',
          name: (data.name || '').trim(),
          access_token: (data.access_token || '').trim(),
          token_expires_at: data.token_expires_at || null,
          notes: data.notes || '',
          teams:
            Array.isArray(data.teams) && data.teams.length > 0
              ? data.teams.map((team: TeamFormInput, index: number) => ({
                  team_id: String(team.team_id ?? '').trim(),
                  team_name: team.team_name ?? '',
                  is_enabled: team.is_enabled !== false,
                  is_default: index === 0 ? Boolean(team.is_default) : Boolean(team.is_default && index === 0),
                }))
              : [emptyTeam()],
        }),
      )
    } catch (error) {
      entries.push(
        createEntry({
          source: 'upload',
          name: '',
          access_token: '',
          notes: '',
          warnings: [`JSON 解析失败: ${(error as Error).message}`],
          valid: false,
          status: 'invalid',
        }),
      )
    }
  }

  return entries
}
