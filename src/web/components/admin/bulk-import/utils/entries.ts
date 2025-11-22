import type { TeamFormInput } from '@/types/admin'
import type { BulkMotherEntry, DuplicateInfo } from '../types'

export const emptyTeam = (): TeamFormInput => ({
  team_id: '',
  team_name: '',
  is_enabled: true,
  is_default: false,
})

const generateId = () =>
  typeof globalThis !== 'undefined' && globalThis.crypto && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `mother_${Math.random().toString(36).slice(2, 10)}`

export const createEntry = (overrides: Partial<BulkMotherEntry> = {}): BulkMotherEntry => ({
  id: generateId(),
  source: 'manual',
  name: '',
  access_token: '',
  token_expires_at: null,
  notes: '',
  teams: [emptyTeam()],
  warnings: [],
  valid: null,
  status: 'draft',
  updatedAt: Date.now(),
  ...overrides,
})

export const serializeForApi = (entry: BulkMotherEntry) => ({
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

export const analyseDuplicates = (entries: BulkMotherEntry[]): DuplicateInfo => {
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

export const downloadAsJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
