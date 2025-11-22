'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'

export const createAuthActions = (dispatch: Dispatch<AdminAction>) => ({
  setAuthenticated(value: boolean) {
    dispatch({ type: 'SET_AUTHENTICATED', payload: value })
  },
  setLoginPassword(value: string) {
    dispatch({ type: 'SET_LOGIN_PASSWORD', payload: value })
  },
  setLoginLoading(value: boolean) {
    dispatch({ type: 'SET_LOGIN_LOADING', payload: value })
  },
  setLoginError(value: string) {
    dispatch({ type: 'SET_LOGIN_ERROR', payload: value })
  },
  setShowPassword(value: boolean) {
    dispatch({ type: 'SET_SHOW_PASSWORD', payload: value })
  },
  setLoading(value: boolean) {
    dispatch({ type: 'SET_LOADING', payload: value })
  },
  resetData() {
    dispatch({ type: 'RESET_DATA' })
  },
  resetAuth() {
    dispatch({ type: 'RESET_AUTH' })
  },
})
