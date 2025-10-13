'use client'

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react'

// Types
export interface MotherAccount {
  id: number
  name: string
  status: string
  seat_limit: number
  seats_used: number
  token_expires_at?: string
  notes?: string
  teams: Array<{
    team_id: string
    team_name?: string
    is_enabled: boolean
    is_default: boolean
  }>
}

export interface UserData {
  id: number
  email: string
  status: string
  team_id?: string
  team_name?: string
  invited_at: string
  redeemed_at?: string
  code_used?: string
}

export interface CodeData {
  id: number
  code: string
  batch_id?: string
  is_used: boolean
  expires_at?: string
  created_at: string
  used_by?: string
  used_at?: string
  mother_id?: number
  mother_name?: string
  team_id?: string
  team_name?: string
  invite_status?: string
}

export interface StatsData {
  total_codes: number
  used_codes: number
  pending_invites: number
  successful_invites: number
  total_users: number
  active_teams: number
  usage_rate: number
  recent_activity: Array<{
    date: string
    invites: number
    redemptions: number
  }>
  status_breakdown: Record<string, number>
  mother_usage: Array<{
    id: number
    name: string
    seat_limit: number
    seats_used: number
    usage_rate: number
    status: string
  }>
  enabled_teams?: number
  max_code_capacity?: number
  active_codes?: number
  remaining_code_quota?: number
}

export interface ServiceStatus {
  backend: "online" | "offline" | "unknown"
  lastCheck: Date | null
}

interface AdminState {
  // Auth state
  authenticated: boolean | null
  loginPassword: string
  loginLoading: boolean
  loginError: string
  showPassword: boolean

  // Data state
  mothers: MotherAccount[]
  users: UserData[]
  codes: CodeData[]
  stats: StatsData | null
  serviceStatus: ServiceStatus

  // Loading states
  loading: boolean
  usersLoading: boolean
  codesLoading: boolean
  statsLoading: boolean

  // UI state
  currentTab: string
  searchTerm: string
  filterStatus: string
  sortBy: string
  sortOrder: "asc" | "desc"
  autoRefresh: boolean
  error: string | null

  // Code generation state
  codeCount: number
  codePrefix: string
  generatedCodes: string[]
  generateLoading: boolean
  showGenerated: boolean

  // Code status filters
  codesStatusMother: string
  codesStatusTeam: string
  codesStatusBatch: string
}

type AdminAction =
  | { type: 'SET_AUTHENTICATED'; payload: boolean }
  | { type: 'SET_LOGIN_PASSWORD'; payload: string }
  | { type: 'SET_LOGIN_LOADING'; payload: boolean }
  | { type: 'SET_LOGIN_ERROR'; payload: string }
  | { type: 'SET_SHOW_PASSWORD'; payload: boolean }
  | { type: 'SET_MOTHERS'; payload: MotherAccount[] }
  | { type: 'SET_USERS'; payload: UserData[] }
  | { type: 'SET_CODES'; payload: CodeData[] }
  | { type: 'SET_STATS'; payload: StatsData | null }
  | { type: 'SET_SERVICE_STATUS'; payload: ServiceStatus }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USERS_LOADING'; payload: boolean }
  | { type: 'SET_CODES_LOADING'; payload: boolean }
  | { type: 'SET_STATS_LOADING'; payload: boolean }
  | { type: 'SET_CURRENT_TAB'; payload: string }
  | { type: 'SET_SEARCH_TERM'; payload: string }
  | { type: 'SET_FILTER_STATUS'; payload: string }
  | { type: 'SET_SORT_BY'; payload: string }
  | { type: 'SET_SORT_ORDER'; payload: "asc" | "desc" }
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

const initialState: AdminState = {
  authenticated: null,
  loginPassword: '',
  loginLoading: false,
  loginError: '',
  showPassword: false,

  mothers: [],
  users: [],
  codes: [],
  stats: null,
  serviceStatus: {
    backend: 'unknown',
    lastCheck: null,
  },

  loading: false,
  usersLoading: false,
  codesLoading: false,
  statsLoading: false,

  currentTab: 'overview',
  searchTerm: '',
  filterStatus: 'all',
  sortBy: 'created_at',
  sortOrder: 'desc',
  autoRefresh: false,
  error: null,

  codeCount: 10,
  codePrefix: '',
  generatedCodes: [],
  generateLoading: false,
  showGenerated: false,

  codesStatusMother: '',
  codesStatusTeam: '',
  codesStatusBatch: '',
}

const adminReducer = (state: AdminState, action: AdminAction): AdminState => {
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
    case 'SET_USERS':
      return { ...state, users: action.payload }
    case 'SET_CODES':
      return { ...state, codes: action.payload }
    case 'SET_STATS':
      return { ...state, stats: action.payload }
    case 'SET_SERVICE_STATUS':
      return { ...state, serviceStatus: action.payload }
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
        users: [],
        codes: [],
        stats: null,
      }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    default:
      return state
  }
}

interface AdminContextType {
  state: AdminState
  dispatch: React.Dispatch<AdminAction>
}

const AdminContext = createContext<AdminContextType | undefined>(undefined)

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(adminReducer, initialState)

  return (
    <AdminContext.Provider value={{ state, dispatch }}>
      {children}
    </AdminContext.Provider>
  )
}

export const useAdminContext = () => {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdminContext must be used within an AdminProvider')
  }
  return context
}

// Custom hooks for common actions
export const useAdminActions = () => {
  const { dispatch } = useAdminContext()

  const setAuthenticated = useCallback((value: boolean) => {
    dispatch({ type: 'SET_AUTHENTICATED', payload: value })
  }, [dispatch])

  const setError = useCallback((value: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: value })
  }, [dispatch])

  const setLoading = useCallback((value: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: value })
  }, [dispatch])

  const setCurrentTab = useCallback((value: string) => {
    dispatch({ type: 'SET_CURRENT_TAB', payload: value })
  }, [dispatch])

  const setSearchTerm = useCallback((value: string) => {
    dispatch({ type: 'SET_SEARCH_TERM', payload: value })
  }, [dispatch])

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' })
  }, [dispatch])

  const setLoginPassword = useCallback((value: string) => {
    dispatch({ type: 'SET_LOGIN_PASSWORD', payload: value })
  }, [dispatch])

  const setLoginError = useCallback((value: string) => {
    dispatch({ type: 'SET_LOGIN_ERROR', payload: value })
  }, [dispatch])

  const setShowPassword = useCallback((value: boolean) => {
    dispatch({ type: 'SET_SHOW_PASSWORD', payload: value })
  }, [dispatch])

  const setFilterStatus = useCallback((value: string) => {
    dispatch({ type: 'SET_FILTER_STATUS', payload: value })
  }, [dispatch])

  const setSortBy = useCallback((value: string) => {
    dispatch({ type: 'SET_SORT_BY', payload: value })
  }, [dispatch])

  const setSortOrder = useCallback((value: 'asc' | 'desc') => {
    dispatch({ type: 'SET_SORT_ORDER', payload: value })
  }, [dispatch])

  const setAutoRefresh = useCallback((value: boolean) => {
    dispatch({ type: 'SET_AUTO_REFRESH', payload: value })
  }, [dispatch])

  const setUsersLoading = useCallback((value: boolean) => {
    dispatch({ type: 'SET_USERS_LOADING', payload: value })
  }, [dispatch])

  const setCodesLoading = useCallback((value: boolean) => {
    dispatch({ type: 'SET_CODES_LOADING', payload: value })
  }, [dispatch])

  const setStatsLoading = useCallback((value: boolean) => {
    dispatch({ type: 'SET_STATS_LOADING', payload: value })
  }, [dispatch])

  const setServiceStatus = useCallback((status: ServiceStatus) => {
    dispatch({ type: 'SET_SERVICE_STATUS', payload: status })
  }, [dispatch])

  const setMothers = useCallback((mothers: MotherAccount[]) => {
    dispatch({ type: 'SET_MOTHERS', payload: mothers })
  }, [dispatch])

  const setUsers = useCallback((users: UserData[]) => {
    dispatch({ type: 'SET_USERS', payload: users })
  }, [dispatch])

  const setCodes = useCallback((codes: CodeData[]) => {
    dispatch({ type: 'SET_CODES', payload: codes })
  }, [dispatch])

  const setStats = useCallback((stats: StatsData | null) => {
    dispatch({ type: 'SET_STATS', payload: stats })
  }, [dispatch])

  const resetData = useCallback(() => {
    dispatch({ type: 'RESET_DATA' })
  }, [dispatch])

  const setCodeCount = useCallback((count: number) => {
    dispatch({ type: 'SET_CODE_COUNT', payload: count })
  }, [dispatch])

  const setCodePrefix = useCallback((prefix: string) => {
    dispatch({ type: 'SET_CODE_PREFIX', payload: prefix })
  }, [dispatch])

  const setGeneratedCodes = useCallback((codes: string[]) => {
    dispatch({ type: 'SET_GENERATED_CODES', payload: codes })
  }, [dispatch])

  const setGenerateLoading = useCallback((value: boolean) => {
    dispatch({ type: 'SET_GENERATE_LOADING', payload: value })
  }, [dispatch])

  const setShowGenerated = useCallback((value: boolean) => {
    dispatch({ type: 'SET_SHOW_GENERATED', payload: value })
  }, [dispatch])

  const setCodesStatusMother = useCallback((value: string) => {
    dispatch({ type: 'SET_CODES_STATUS_MOTHER', payload: value })
  }, [dispatch])

  const setCodesStatusTeam = useCallback((value: string) => {
    dispatch({ type: 'SET_CODES_STATUS_TEAM', payload: value })
  }, [dispatch])

  const setCodesStatusBatch = useCallback((value: string) => {
    dispatch({ type: 'SET_CODES_STATUS_BATCH', payload: value })
  }, [dispatch])

  return {
    setAuthenticated,
    setError,
    setLoading,
    setCurrentTab,
    setSearchTerm,
    clearError,
    setLoginPassword,
    setLoginError,
    setShowPassword,
    setFilterStatus,
    setSortBy,
    setSortOrder,
    setAutoRefresh,
    setUsersLoading,
    setCodesLoading,
    setStatsLoading,
    setServiceStatus,
    setMothers,
    setUsers,
    setCodes,
    setStats,
    resetData,
    setCodeCount,
    setCodePrefix,
    setGeneratedCodes,
    setGenerateLoading,
    setShowGenerated,
    setCodesStatusMother,
    setCodesStatusTeam,
    setCodesStatusBatch,
    dispatch,
  }
}
