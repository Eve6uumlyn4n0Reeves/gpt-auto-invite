'use client'

import React, { createContext, useContext, useMemo, useReducer, useRef, useEffect, useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { PoolState } from './types'
import { createPoolActions } from './actions'
import { poolReducer, type PoolAction, buildInitialPoolState } from './reducer'

interface PoolContextValue {
  getState: () => PoolState
  subscribe: (listener: () => void) => () => void
  actions: ReturnType<typeof createPoolActions>
}

const PoolStateContext = createContext<PoolContextValue | undefined>(undefined)

export const PoolProvider: React.FC<{ children: ReactNode; initialState?: Partial<PoolState> }> = ({ children, initialState }) => {
  const [state, dispatch] = useReducer(poolReducer, initialState, (overrides?: Partial<PoolState>) => buildInitialPoolState(overrides))
  const actions = useMemo(() => createPoolActions(dispatch), [dispatch])
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

  const value = useMemo<PoolContextValue>(() => ({ getState, subscribe, actions }), [getState, subscribe, actions])
  return <PoolStateContext.Provider value={value}>{children}</PoolStateContext.Provider>
}

const usePoolInternal = () => {
  const ctx = useContext(PoolStateContext)
  if (!ctx) throw new Error('usePoolContext must be used within a PoolProvider')
  return ctx
}

export const usePoolSelector = <T,>(selector: (state: PoolState) => T) => {
  const { getState, subscribe } = usePoolInternal()
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  return useSyncExternalStore(subscribe, () => selectorRef.current(getState()), () => selectorRef.current(getState()))
}

export const usePoolActions = () => usePoolInternal().actions

export const usePoolContext = () => {
  const actions = usePoolActions()
  const state = usePoolSelector((s) => s)
  return { state, actions }
}

export type { PoolState } from './types'

