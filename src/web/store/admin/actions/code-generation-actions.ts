'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'
import type { CodeSkuSummary } from '@/shared/api-types'

export const createCodeGenerationActions = (dispatch: Dispatch<AdminAction>) => ({
  setCodeCount(count: number) {
    dispatch({ type: 'SET_CODE_COUNT', payload: count })
  },
  setCodePrefix(prefix: string) {
    dispatch({ type: 'SET_CODE_PREFIX', payload: prefix })
  },
  setCodeLifecyclePlan(plan: 'weekly' | 'monthly') {
    dispatch({ type: 'SET_CODE_LIFECYCLE_PLAN', payload: plan })
  },
  setCodeSwitchLimit(limit: number) {
    dispatch({ type: 'SET_CODE_SWITCH_LIMIT', payload: limit })
  },
  setGeneratedCodes(codes: string[]) {
    dispatch({ type: 'SET_GENERATED_CODES', payload: codes })
  },
  setGenerateLoading(value: boolean) {
    dispatch({ type: 'SET_GENERATE_LOADING', payload: value })
  },
  setShowGenerated(value: boolean) {
    dispatch({ type: 'SET_SHOW_GENERATED', payload: value })
  },
  setCodesStatusMother(value: string) {
    dispatch({ type: 'SET_CODES_STATUS_MOTHER', payload: value })
  },
  setCodesStatusTeam(value: string) {
    dispatch({ type: 'SET_CODES_STATUS_TEAM', payload: value })
  },
  setCodesStatusBatch(value: string) {
    dispatch({ type: 'SET_CODES_STATUS_BATCH', payload: value })
  },
  setCodeSkuSlug(slug: string) {
    dispatch({ type: 'SET_CODE_SKU_SLUG', payload: slug })
  },
  setCodeSkus(skus: CodeSkuSummary[]) {
    dispatch({ type: 'SET_CODE_SKUS', payload: skus })
  },
})
