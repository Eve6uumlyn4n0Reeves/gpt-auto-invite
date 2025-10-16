'use client'

import React, {
  createContext,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { AdminState } from '@/store/admin/types'
import { createAdminActions } from '@/store/admin/actions'
import { adminReducer, type AdminAction, buildInitialAdminState } from '@/store/admin/reducer'

interface AdminContextValue {
  getState: () => AdminState
  subscribe: (listener: () => void) => () => void
  actions: ReturnType<typeof createAdminActions>
}

const AdminStateContext = createContext<AdminContextValue | undefined>(undefined)

interface AdminProviderProps {
  children: ReactNode
  initialState?: Partial<AdminState>
}

export const AdminProvider: React.FC<AdminProviderProps> = ({ children, initialState }) => {
  const [state, dispatch] = useReducer(
    adminReducer,
    initialState,
    (overrides?: Partial<AdminState>) => buildInitialAdminState(overrides),
  )

  const actions = useMemo(() => createAdminActions(dispatch), [dispatch])
  const stateRef = useRef(state)
  const listenersRef = useRef(new Set<() => void>())

  useEffect(() => {
    stateRef.current = state
    listenersRef.current.forEach((listener) => listener())
  }, [state])

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const getState = useCallback(() => stateRef.current, [])

  const value = useMemo<AdminContextValue>(() => ({ getState, subscribe, actions }), [actions, getState, subscribe])

  return <AdminStateContext.Provider value={value}>{children}</AdminStateContext.Provider>
}

const useAdminInternalContext = () => {
  const context = useContext(AdminStateContext)
  if (!context) {
    throw new Error('useAdminContext must be used within an AdminProvider')
  }
  return context
}

export const useAdminSelector = <T,>(selector: (state: AdminState) => T) => {
  const { getState, subscribe } = useAdminInternalContext()
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  return useSyncExternalStore(
    subscribe,
    () => selectorRef.current(getState()),
    () => selectorRef.current(getState()),
  )
}

export const useAdminActions = () => {
  const { actions } = useAdminInternalContext()
  return actions
}

export const useAdminContext = () => {
  const actions = useAdminActions()
  const state = useAdminSelector((adminState) => adminState)
  return { state, actions }
}

export type {
  AdminState,
  MotherAccount,
  UserData,
  CodeData,
  AuditLog,
  BulkHistoryEntry,
  StatsData,
  ServiceStatus,
} from '@/store/admin/types'
