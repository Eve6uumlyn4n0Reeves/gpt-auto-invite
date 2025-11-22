"use client"

import { useState, useCallback, useEffect, useRef } from "react"

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

interface UseAsyncOptions {
  immediate?: boolean
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
}

export function useAsync<T>(asyncFunction: () => Promise<T>, options: UseAsyncOptions = {}) {
  const { immediate = false, onSuccess, onError } = options
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  })

  const mountedRef = useRef(true)
  const lastCallIdRef = useRef(0)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const execute = useCallback(async () => {
    const callId = ++lastCallIdRef.current

    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const data = await asyncFunction()

      if (mountedRef.current && callId === lastCallIdRef.current) {
        setState({ data, loading: false, error: null })
        onSuccess?.(data)
      }

      return data
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))

      if (mountedRef.current && callId === lastCallIdRef.current) {
        setState({ data: null, loading: false, error: err })
        onError?.(err)
      }

      throw err
    }
  }, [asyncFunction, onSuccess, onError])

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  useEffect(() => {
    if (immediate) {
      execute()
    }
  }, [immediate, execute])

  return {
    ...state,
    execute,
    reset,
  }
}

export function useAsyncCallback<T extends any[], R>(
  asyncFunction: (...args: T) => Promise<R>,
  options: UseAsyncOptions = {},
) {
  const { onSuccess, onError } = options
  const [state, setState] = useState<AsyncState<R>>({
    data: null,
    loading: false,
    error: null,
  })

  const mountedRef = useRef(true)
  const lastCallIdRef = useRef(0)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const execute = useCallback(
    async (...args: T) => {
      const callId = ++lastCallIdRef.current

      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const data = await asyncFunction(...args)

        if (mountedRef.current && callId === lastCallIdRef.current) {
          setState({ data, loading: false, error: null })
          onSuccess?.(data)
        }

        return data
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))

        if (mountedRef.current && callId === lastCallIdRef.current) {
          setState({ data: null, loading: false, error: err })
          onError?.(err)
        }

        throw err
      }
    },
    [asyncFunction, onSuccess, onError],
  )

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return {
    ...state,
    execute,
    reset,
  }
}
