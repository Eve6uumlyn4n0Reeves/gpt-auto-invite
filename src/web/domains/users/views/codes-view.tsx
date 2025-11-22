'use client'

import { CodesSection } from '@/components/admin/sections/codes-section'
import { CodesGeneratedPanel } from '@/components/admin/views/codes/components/codes-generated-panel'
import { CodeSkuManager } from '@/components/admin/views/codes/components/sku-manager'
import { useCodesViewModel } from '@/domains/users/view-models/use-codes-view-model'

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
    setCodeLifecyclePlan,
    setCodeSwitchLimit,
    codeCount,
    codePrefix,
    codeLifecyclePlan,
    codeSwitchLimit,
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
    codeSkus,
    selectedSkuSlug,
    onSkuChange,
    skuLoading,
    capacityWarn,
    aliveMothers,
    createSku,
    updateSku,
    refreshSkus,
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
        codeLifecyclePlan={codeLifecyclePlan}
        onLifecyclePlanChange={setCodeLifecyclePlan}
        codeSwitchLimit={codeSwitchLimit}
        onSwitchLimitChange={(value) => setCodeSwitchLimit(value)}
        generateLoading={generateLoading}
        codeSkus={codeSkus}
        selectedSkuSlug={selectedSkuSlug}
        onSkuChange={onSkuChange}
        skuLoading={skuLoading}
        remainingQuota={remainingQuota}
        maxCodeCapacity={maxCodeCapacity}
        activeCodesCount={activeCodesCount}
        capacityWarn={capacityWarn}
        aliveMothers={aliveMothers}
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

      <CodeSkuManager
        skus={codeSkus}
        loading={skuLoading}
        onCreate={createSku}
        onUpdate={updateSku}
        onRefresh={refreshSkus}
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
