'use client'

import React, { createContext, useContext, useMemo, useReducer, useRef, useEffect, useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { UsersState } from './types'
import { usersReducer, type UsersAction, buildInitialUsersState } from './reducer'
import { createUsersActions } from './actions'

interface UsersContextValue {
  getState: () => UsersState
  subscribe: (listener: () => void) => () => void
  actions: ReturnType<typeof createUsersActions>
}

const UsersStateContext = createContext<UsersContextValue | undefined>(undefined)

export const UsersProvider: React.FC<{ children: ReactNode; initialState?: Partial<UsersState> }> = ({ children, initialState }) => {
  const [state, dispatch] = useReducer(usersReducer, initialState, (overrides?: Partial<UsersState>) => buildInitialUsersState(overrides))
  const actions = useMemo(() => createUsersActions(dispatch), [dispatch])
  const stateRef = useRef(state)
  const listenersRef = useRef(new Set<() => void>())

  useEffect(() => {
    stateRef.current = state
    listenersRef.current.forEach((l) => l())
  }, [state])

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  const getState = useCallback(() => stateRef.current, [])

  const value = useMemo<UsersContextValue>(() => ({ getState, subscribe, actions }), [getState, subscribe, actions])
  return <UsersStateContext.Provider value={value}>{children}</UsersStateContext.Provider>
}

const useUsersInternal = () => {
  const ctx = useContext(UsersStateContext)
  if (!ctx) throw new Error('useUsersContext must be used within a UsersProvider')
  return ctx
}

export const useUsersSelector = <T,>(selector: (state: UsersState) => T) => {
  const { getState, subscribe } = useUsersInternal()
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  return useSyncExternalStore(subscribe, () => selectorRef.current(getState()), () => selectorRef.current(getState()))
}

export const useUsersActions = () => useUsersInternal().actions

export const useUsersContext = () => {
  const actions = useUsersActions()
  const state = useUsersSelector((s) => s)
  return { state, actions }
}

