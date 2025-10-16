'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'

export const createCodeGenerationActions = (dispatch: Dispatch<AdminAction>) => ({
  setCodeCount(count: number) {
    dispatch({ type: 'SET_CODE_COUNT', payload: count })
  },
  setCodePrefix(prefix: string) {
    dispatch({ type: 'SET_CODE_PREFIX', payload: prefix })
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
})
