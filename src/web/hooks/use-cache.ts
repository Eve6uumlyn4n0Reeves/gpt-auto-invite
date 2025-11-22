"use client"

import { useState, useCallback, useRef } from "react"

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

interface CacheOptions {
  ttl?: number // Time to live in milliseconds
  maxSize?: number
}

export function useCache<T>(options: CacheOptions = {}) {
  const { ttl = 5 * 60 * 1000, maxSize = 100 } = options // Default 5 minutes TTL

  const cache = useRef<Map<string, CacheEntry<T>>>(new Map())
  const [, forceUpdate] = useState({})

  const cleanup = useCallback(() => {
    const now = Date.now()
    const entries = Array.from(cache.current.entries())

    // Remove expired entries
    entries.forEach(([key, entry]) => {
      if (now > entry.expiresAt) {
        cache.current.delete(key)
      }
    })

    // Remove oldest entries if cache is too large
    if (cache.current.size > maxSize) {
      const sortedEntries = Array.from(cache.current.entries()).sort(([, a], [, b]) => a.timestamp - b.timestamp)

      const toRemove = sortedEntries.slice(0, cache.current.size - maxSize)
      toRemove.forEach(([key]) => cache.current.delete(key))
    }
  }, [maxSize])

  const set = useCallback(
    (key: string, data: T) => {
      const now = Date.now()
      cache.current.set(key, {
        data,
        timestamp: now,
        expiresAt: now + ttl,
      })
      cleanup()
      forceUpdate({})
    },
    [ttl, cleanup],
  )

  const get = useCallback((key: string): T | undefined => {
    const entry = cache.current.get(key)
    if (!entry) return undefined

    const now = Date.now()
    if (now > entry.expiresAt) {
      cache.current.delete(key)
      return undefined
    }

    return entry.data
  }, [])

  const has = useCallback((key: string): boolean => {
    const entry = cache.current.get(key)
    if (!entry) return false

    const now = Date.now()
    if (now > entry.expiresAt) {
      cache.current.delete(key)
      return false
    }

    return true
  }, [])

  const remove = useCallback((key: string) => {
    cache.current.delete(key)
    forceUpdate({})
  }, [])

  const clear = useCallback(() => {
    cache.current.clear()
    forceUpdate({})
  }, [])

  const size = cache.current.size

  return {
    set,
    get,
    has,
    remove,
    clear,
    size,
  }
}

export function useCachedFetch<T>(url: string, options: RequestInit & CacheOptions = {}) {
  const { ttl, maxSize, ...fetchOptions } = options
  const cache = useCache<T>({ ttl, maxSize })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const fetchOptionsRef = useRef(fetchOptions)

  fetchOptionsRef.current = fetchOptions

  const fetchData = useCallback(
    async (forceRefresh = false): Promise<T | undefined> => {
      const cacheKey = `${url}-${JSON.stringify(fetchOptionsRef.current)}`

      if (!forceRefresh && cache.has(cacheKey)) {
        return cache.get(cacheKey)
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(url, fetchOptionsRef.current)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        cache.set(cacheKey, data)
        return data
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error")
        setError(error)
        throw error
      } finally {
        setLoading(false)
      }
    },
    [url, cache],
  )

  return {
    fetchData,
    loading,
    error,
    cache,
  }
}
