'use client'

import { initialPoolState } from './state'
import type { PoolState, PoolMotherAccount } from './types'

export type PoolAction =
  | { type: 'POOL_SET_MOTHERS'; payload: PoolMotherAccount[] }
  | { type: 'POOL_SET_MOTHERS_LOADING'; payload: boolean }
  | { type: 'POOL_SET_MOTHERS_PAGE'; payload: number }
  | { type: 'POOL_SET_MOTHERS_PAGE_SIZE'; payload: number }
  | { type: 'POOL_SET_MOTHERS_TOTAL'; payload: number }
  | { type: 'POOL_SET_MOTHERS_INITIALIZED'; payload: boolean }
  | { type: 'POOL_SET_GROUPS'; payload: PoolState['poolGroups'] }
  | { type: 'POOL_SET_GROUPS_LOADING'; payload: boolean }
  | { type: 'POOL_SET_GROUPS_INITIALIZED'; payload: boolean }
  | { type: 'POOL_SET_SELECTED_GROUP'; payload: number | null }
  | { type: 'POOL_SET_TEMPLATES'; payload: { team?: string; childName?: string; childEmail?: string; domain?: string } }
  | { type: 'POOL_SET_PREVIEW'; payload: string[] }
  | { type: 'POOL_SET_SAVING'; payload: boolean }
  | { type: 'POOL_SET_CREATING'; payload: boolean }

export const poolReducer = (state: PoolState, action: PoolAction): PoolState => {
  switch (action.type) {
    case 'POOL_SET_MOTHERS':
      return { ...state, mothers: action.payload }
    case 'POOL_SET_MOTHERS_LOADING':
      return { ...state, mothersLoading: action.payload }
    case 'POOL_SET_MOTHERS_PAGE':
      return { ...state, mothersPage: action.payload }
    case 'POOL_SET_MOTHERS_PAGE_SIZE':
      return { ...state, mothersPageSize: action.payload }
    case 'POOL_SET_MOTHERS_TOTAL':
      return { ...state, mothersTotal: action.payload }
    case 'POOL_SET_MOTHERS_INITIALIZED':
      return { ...state, mothersInitialized: action.payload }
    case 'POOL_SET_GROUPS':
      return { ...state, poolGroups: action.payload }
    case 'POOL_SET_GROUPS_LOADING':
      return { ...state, poolGroupsLoading: action.payload }
    case 'POOL_SET_GROUPS_INITIALIZED':
      return { ...state, poolGroupsInitialized: action.payload }
    case 'POOL_SET_SELECTED_GROUP':
      return { ...state, selectedGroupId: action.payload }
    case 'POOL_SET_TEMPLATES':
      return {
        ...state,
        teamTemplate: action.payload.team ?? state.teamTemplate,
        childNameTemplate: action.payload.childName ?? state.childNameTemplate,
        childEmailTemplate: action.payload.childEmail ?? state.childEmailTemplate,
        emailDomain: action.payload.domain ?? state.emailDomain,
      }
    case 'POOL_SET_PREVIEW':
      return { ...state, namePreview: action.payload }
    case 'POOL_SET_SAVING':
      return { ...state, savingSettings: action.payload }
    case 'POOL_SET_CREATING':
      return { ...state, creatingGroup: action.payload }
    default:
      return state
  }
}

export const buildInitialPoolState = (overrides?: Partial<PoolState>): PoolState => {
  if (!overrides) return JSON.parse(JSON.stringify(initialPoolState)) as PoolState
  return { ...initialPoolState, ...overrides }
}
