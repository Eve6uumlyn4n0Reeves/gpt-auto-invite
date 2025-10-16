'use client'

import { CodesSection } from '@/components/admin/sections/codes-section'
import { CodesGeneratedPanel } from './codes/components/codes-generated-panel'
import { useCodesViewModel } from './codes/use-codes-view-model'

export function CodesView() {
  const {
    codesLoading,
    filteredCodes,
    codeTableColumns,
    containerHeight,
    itemHeight,
    selectedCodes,
    batchOperation,
    setBatchOperation,
    batchLoading,
    clearSelection,
    supportedBatchActions,
    executeBatch,
    refreshCodes,
    refreshQuota,
    handleGenerateCodes,
    handleCopyDetails,
    setCodeCount,
    setCodePrefix,
    codeCount,
    codePrefix,
    remainingQuota,
    maxCodeCapacity,
    activeCodesCount,
    quotaLoading,
    quotaError,
    generatedCodesPreview,
    showGenerated,
    copyGeneratedCodes,
    downloadGeneratedCodes,
    codesPage,
    codesPageSize,
    codesTotal,
    handlePageChange,
    handlePageSizeChange,
    generateLoading,
  } = useCodesViewModel()

  return (
    <div className="space-y-6">
      <CodesSection
        loading={codesLoading}
        filteredCodes={filteredCodes}
        codeTableColumns={codeTableColumns}
        containerHeight={containerHeight}
        itemHeight={itemHeight}
        selectedCodes={selectedCodes}
        batchOperation={batchOperation}
        supportedBatchActions={supportedBatchActions}
        batchLoading={batchLoading}
        onClearCache={refreshCodes}
        onRefresh={() => {
          refreshCodes()
          void refreshQuota()
        }}
        onBatchOperationChange={setBatchOperation}
        onClearSelection={clearSelection}
        onExecuteBatch={executeBatch}
        onCodeCountInput={(value) => setCodeCount(Math.max(0, Number.parseInt(value, 10) || 0))}
        codeCount={codeCount}
        codePrefix={codePrefix}
        onCodePrefixChange={setCodePrefix}
        generateLoading={generateLoading}
        remainingQuota={remainingQuota}
        maxCodeCapacity={maxCodeCapacity}
        activeCodesCount={activeCodesCount}
        quotaLoading={quotaLoading}
        quotaError={quotaError}
        onGenerateCodes={handleGenerateCodes}
        onRowAction={handleCopyDetails}
        page={codesPage}
        pageSize={codesPageSize}
        total={codesTotal}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      {showGenerated && generatedCodesPreview.length > 0 && (
        <CodesGeneratedPanel
          codes={generatedCodesPreview}
          onCopyAll={copyGeneratedCodes}
          onDownload={downloadGeneratedCodes}
        />
      )}
    </div>
  )
}
