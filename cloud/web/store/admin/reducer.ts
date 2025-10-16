'use client'

import { initialAdminState } from '@/store/admin/state'
import type {
  AdminState,
  MotherAccount,
  UserData,
  CodeData,
  AuditLog,
  BulkHistoryEntry,
  StatsData,
  ServiceStatus,
} from '@/store/admin/types'

export type AdminAction =
  | { type: 'SET_AUTHENTICATED'; payload: boolean }
  | { type: 'SET_LOGIN_PASSWORD'; payload: string }
  | { type: 'SET_LOGIN_LOADING'; payload: boolean }
  | { type: 'SET_LOGIN_ERROR'; payload: string }
  | { type: 'SET_SHOW_PASSWORD'; payload: boolean }
  | { type: 'SET_MOTHERS'; payload: MotherAccount[] }
  | { type: 'SET_MOTHERS_LOADING'; payload: boolean }
  | { type: 'SET_MOTHERS_PAGE'; payload: number }
  | { type: 'SET_MOTHERS_PAGE_SIZE'; payload: number }
  | { type: 'SET_MOTHERS_TOTAL'; payload: number }
  | { type: 'SET_MOTHERS_INITIALIZED'; payload: boolean }
  | { type: 'SET_USERS'; payload: UserData[] }
  | { type: 'SET_CODES'; payload: CodeData[] }
  | { type: 'SET_AUDIT_LOGS'; payload: AuditLog[] }
  | { type: 'SET_BULK_HISTORY'; payload: BulkHistoryEntry[] }
  | { type: 'SET_STATS'; payload: StatsData | null }
  | { type: 'SET_SERVICE_STATUS'; payload: ServiceStatus }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USERS_LOADING'; payload: boolean }
  | { type: 'SET_CODES_LOADING'; payload: boolean }
  | { type: 'SET_STATS_LOADING'; payload: boolean }
  | { type: 'SET_USERS_PAGE'; payload: number }
  | { type: 'SET_USERS_PAGE_SIZE'; payload: number }
  | { type: 'SET_USERS_TOTAL'; payload: number }
  | { type: 'SET_USERS_INITIALIZED'; payload: boolean }
  | { type: 'SET_CODES_PAGE'; payload: number }
  | { type: 'SET_CODES_PAGE_SIZE'; payload: number }
  | { type: 'SET_CODES_TOTAL'; payload: number }
  | { type: 'SET_CODES_INITIALIZED'; payload: boolean }
  | { type: 'SET_AUDIT_PAGE'; payload: number }
  | { type: 'SET_AUDIT_PAGE_SIZE'; payload: number }
  | { type: 'SET_AUDIT_TOTAL'; payload: number }
  | { type: 'SET_AUDIT_INITIALIZED'; payload: boolean }
  | { type: 'SET_BULK_HISTORY_PAGE'; payload: number }
  | { type: 'SET_BULK_HISTORY_PAGE_SIZE'; payload: number }
  | { type: 'SET_BULK_HISTORY_TOTAL'; payload: number }
  | { type: 'SET_BULK_HISTORY_INITIALIZED'; payload: boolean }
  | { type: 'SET_CURRENT_TAB'; payload: string }
  | { type: 'SET_SEARCH_TERM'; payload: string }
  | { type: 'SET_FILTER_STATUS'; payload: string }
  | { type: 'SET_SORT_BY'; payload: string }
  | { type: 'SET_SORT_ORDER'; payload: 'asc' | 'desc' }
  | { type: 'SET_AUTO_REFRESH'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CODE_COUNT'; payload: number }
  | { type: 'SET_CODE_PREFIX'; payload: string }
  | { type: 'SET_GENERATED_CODES'; payload: string[] }
  | { type: 'SET_GENERATE_LOADING'; payload: boolean }
  | { type: 'SET_SHOW_GENERATED'; payload: boolean }
  | { type: 'SET_CODES_STATUS_MOTHER'; payload: string }
  | { type: 'SET_CODES_STATUS_TEAM'; payload: string }
  | { type: 'SET_CODES_STATUS_BATCH'; payload: string }
  | { type: 'RESET_AUTH' }
  | { type: 'RESET_DATA' }
  | { type: 'CLEAR_ERROR' }

export const adminReducer = (state: AdminState, action: AdminAction): AdminState => {
  switch (action.type) {
    case 'SET_AUTHENTICATED':
      return { ...state, authenticated: action.payload }
    case 'SET_LOGIN_PASSWORD':
      return { ...state, loginPassword: action.payload }
    case 'SET_LOGIN_LOADING':
      return { ...state, loginLoading: action.payload }
    case 'SET_LOGIN_ERROR':
      return { ...state, loginError: action.payload }
    case 'SET_SHOW_PASSWORD':
      return { ...state, showPassword: action.payload }
    case 'SET_MOTHERS':
      return { ...state, mothers: action.payload }
    case 'SET_MOTHERS_LOADING':
      return { ...state, mothersLoading: action.payload }
    case 'SET_MOTHERS_PAGE':
      return { ...state, mothersPage: action.payload }
    case 'SET_MOTHERS_PAGE_SIZE':
      return { ...state, mothersPageSize: action.payload }
    case 'SET_MOTHERS_TOTAL':
      return { ...state, mothersTotal: action.payload }
    case 'SET_MOTHERS_INITIALIZED':
      return { ...state, mothersInitialized: action.payload }
    case 'SET_USERS':
      return { ...state, users: action.payload }
    case 'SET_CODES':
      return { ...state, codes: action.payload }
    case 'SET_AUDIT_LOGS':
      return { ...state, auditLogs: action.payload }
    case 'SET_BULK_HISTORY':
      return { ...state, bulkHistory: action.payload }
    case 'SET_STATS':
      return { ...state, stats: action.payload }
    case 'SET_SERVICE_STATUS':
      return { ...state, serviceStatus: action.payload }
    case 'SET_USERS_PAGE':
      return { ...state, usersPage: action.payload }
    case 'SET_USERS_PAGE_SIZE':
      return { ...state, usersPageSize: action.payload }
    case 'SET_USERS_TOTAL':
      return { ...state, usersTotal: action.payload }
    case 'SET_USERS_INITIALIZED':
      return { ...state, usersInitialized: action.payload }
    case 'SET_CODES_PAGE':
      return { ...state, codesPage: action.payload }
    case 'SET_CODES_PAGE_SIZE':
      return { ...state, codesPageSize: action.payload }
    case 'SET_CODES_TOTAL':
      return { ...state, codesTotal: action.payload }
    case 'SET_CODES_INITIALIZED':
      return { ...state, codesInitialized: action.payload }
    case 'SET_AUDIT_PAGE':
      return { ...state, auditPage: action.payload }
    case 'SET_AUDIT_PAGE_SIZE':
      return { ...state, auditPageSize: action.payload }
    case 'SET_AUDIT_TOTAL':
      return { ...state, auditTotal: action.payload }
    case 'SET_AUDIT_INITIALIZED':
      return { ...state, auditInitialized: action.payload }
    case 'SET_BULK_HISTORY_PAGE':
      return { ...state, bulkHistoryPage: action.payload }
    case 'SET_BULK_HISTORY_PAGE_SIZE':
      return { ...state, bulkHistoryPageSize: action.payload }
    case 'SET_BULK_HISTORY_TOTAL':
      return { ...state, bulkHistoryTotal: action.payload }
    case 'SET_BULK_HISTORY_INITIALIZED':
      return { ...state, bulkHistoryInitialized: action.payload }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_USERS_LOADING':
      return { ...state, usersLoading: action.payload }
    case 'SET_CODES_LOADING':
      return { ...state, codesLoading: action.payload }
    case 'SET_STATS_LOADING':
      return { ...state, statsLoading: action.payload }
    case 'SET_CURRENT_TAB':
      return { ...state, currentTab: action.payload }
    case 'SET_SEARCH_TERM':
      return { ...state, searchTerm: action.payload }
    case 'SET_FILTER_STATUS':
      return { ...state, filterStatus: action.payload }
    case 'SET_SORT_BY':
      return { ...state, sortBy: action.payload }
    case 'SET_SORT_ORDER':
      return { ...state, sortOrder: action.payload }
    case 'SET_AUTO_REFRESH':
      return { ...state, autoRefresh: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'SET_CODE_COUNT':
      return { ...state, codeCount: action.payload }
    case 'SET_CODE_PREFIX':
      return { ...state, codePrefix: action.payload }
    case 'SET_GENERATED_CODES':
      return { ...state, generatedCodes: action.payload }
    case 'SET_GENERATE_LOADING':
      return { ...state, generateLoading: action.payload }
    case 'SET_SHOW_GENERATED':
      return { ...state, showGenerated: action.payload }
    case 'SET_CODES_STATUS_MOTHER':
      return { ...state, codesStatusMother: action.payload }
    case 'SET_CODES_STATUS_TEAM':
      return { ...state, codesStatusTeam: action.payload }
    case 'SET_CODES_STATUS_BATCH':
      return { ...state, codesStatusBatch: action.payload }
    case 'RESET_AUTH':
      return {
        ...state,
        authenticated: false,
        loginPassword: '',
        loginError: '',
        showPassword: false,
      }
    case 'RESET_DATA':
      return {
        ...state,
        mothers: [],
        mothersPage: initialAdminState.mothersPage,
        mothersPageSize: initialAdminState.mothersPageSize,
        mothersTotal: 0,
        mothersInitialized: false,
        mothersLoading: false,
        users: [],
        usersTotal: 0,
        usersInitialized: false,
        usersPage: initialAdminState.usersPage,
        usersPageSize: initialAdminState.usersPageSize,
        codes: [],
        codesTotal: 0,
        codesInitialized: false,
        codesPage: initialAdminState.codesPage,
        codesPageSize: initialAdminState.codesPageSize,
        auditLogs: [],
        auditTotal: 0,
        auditInitialized: false,
        auditPage: initialAdminState.auditPage,
        auditPageSize: initialAdminState.auditPageSize,
        bulkHistory: [],
        bulkHistoryTotal: 0,
        bulkHistoryInitialized: false,
        bulkHistoryPage: initialAdminState.bulkHistoryPage,
        bulkHistoryPageSize: initialAdminState.bulkHistoryPageSize,
        stats: null,
      }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    default:
      return state
  }
}

export const buildInitialAdminState = (overrides?: Partial<AdminState>): AdminState => {
  if (!overrides) {
    return JSON.parse(JSON.stringify(initialAdminState)) as AdminState
  }

  return {
    ...initialAdminState,
    ...overrides,
    serviceStatus: overrides.serviceStatus ?? initialAdminState.serviceStatus,
  }
}
