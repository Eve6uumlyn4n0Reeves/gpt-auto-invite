'use client'

import type { BulkMotherEntry, DuplicateInfo } from '../types'
import { BulkImportEntryCard } from './bulk-import-entry-card'

interface BulkImportEntryListProps {
  entries: BulkMotherEntry[]
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

export function BulkImportEntryList({
  entries,
  duplicateInfo,
  onUpdateEntryField,
  onRemoveEntry,
  onAddTeam,
  onUpdateTeamField,
  onRemoveTeam,
}: BulkImportEntryListProps) {
  return (
    <div className="space-y-4">
      {entries.map((entry, index) => (
        <BulkImportEntryCard
          key={entry.id}
          entry={entry}
          index={index}
          duplicateInfo={duplicateInfo}
          onUpdateEntryField={onUpdateEntryField}
          onRemoveEntry={onRemoveEntry}
          onAddTeam={onAddTeam}
          onUpdateTeamField={onUpdateTeamField}
          onRemoveTeam={onRemoveTeam}
        />
      ))}
    </div>
  )
}
