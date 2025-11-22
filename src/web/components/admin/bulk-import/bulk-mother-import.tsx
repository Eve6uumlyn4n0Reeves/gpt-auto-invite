'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useBulkImportWorkflow } from './use-bulk-import-workflow'
import { BulkImportInput } from './components/bulk-import-input'
import { BulkImportStats } from './components/bulk-import-stats'
import { BulkImportActions } from './components/bulk-import-actions'
import { BulkImportEntryList } from './components/bulk-import-entry-list'
import { BulkImportSummary } from './components/bulk-import-summary'
import type { BulkMotherImportProps } from './types'
import { downloadAsJson } from './utils/entries'

export function BulkMotherImport(props: BulkMotherImportProps) {
  const workflow = useBulkImportWorkflow(props)

  const {
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
  } = workflow

  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-semibold">母号批量导入</CardTitle>
        <CardDescription>
          通过粘贴文本或上传 JSON/JSONL 文件，支持预览、校验和批量导入，过程中的错误条目可在导入前后再次编辑或导出。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <BulkImportInput
          textInput={textInput}
          delimiter={delimiter}
          loading={loading}
          lastUploadedFile={lastUploadedFile}
          onTextChange={setTextInput}
          onDelimiterChange={setDelimiter}
          onParseText={handleParseText}
          onClearText={() => setTextInput('')}
          onFileUpload={handleFileUpload}
        />

        {error && (
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertDescription className="text-red-600 text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {entries.length > 0 && (
          <>
            <BulkImportStats
              total={entries.length}
              validCount={validEntries.length}
              invalidCount={invalidEntries.length}
              duplicateNames={duplicateInfo.duplicateNames.size}
              duplicateTokens={duplicateInfo.duplicateTokens.size}
              showDuplicatesNotice={anyDuplicates}
            />

            <BulkImportActions
              stage={stage}
              loading={loading}
              hasEntries={entries.length > 0}
              canImport={validEntries.length > 0 && stage === 'validated'}
              onValidate={validateEntries}
              onImport={importEntries}
              onReset={resetWorkflow}
              failedCount={failedEntries.length}
              onExportFailed={
                failedEntries.length > 0
                  ? () =>
                      downloadAsJson(
                        `母号导入失败-${Date.now()}.json`,
                        failedEntries,
                      )
                  : undefined
              }
            />

            <BulkImportEntryList
              entries={entries}
              duplicateInfo={duplicateInfo}
              onUpdateEntryField={updateEntryField}
              onRemoveEntry={removeEntry}
              onAddTeam={addTeamToEntry}
              onUpdateTeamField={updateTeamField}
              onRemoveTeam={removeTeamFromEntry}
            />
          </>
        )}

        {importSummary && <BulkImportSummary summary={importSummary} />}
      </CardContent>
    </Card>
  )
}
