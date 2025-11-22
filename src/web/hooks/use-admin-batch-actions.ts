'use client'

import { useCallback, useEffect, useState } from 'react'

interface BatchActions {
  codes: string[]
  users: string[]
}

interface UseAdminBatchActionsResult {
  actions: BatchActions
  loading: boolean
  refresh: () => Promise<void>
}

let cachedActions: BatchActions | null = null
let inflightPromise: Promise<BatchActions> | null = null

const DEFAULT_ACTIONS: BatchActions = { codes: [], users: [] }

const fetchBatchActions = async (): Promise<BatchActions> => {
  if (cachedActions) {
    return cachedActions
  }
  if (inflightPromise) {
    return inflightPromise
  }

  inflightPromise = fetch('/api/admin/batch/supported-actions', {
    headers: {
      'X-Request-Source': 'nextjs-frontend',
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('获取批量操作支持列表失败')
      }
      const data = await response.json().catch(() => DEFAULT_ACTIONS)
      const result = {
        codes: Array.isArray(data?.codes) ? data.codes : [],
        users: Array.isArray(data?.users) ? data.users : [],
      }
      cachedActions = result
      return result
    })
    .finally(() => {
      inflightPromise = null
    })

  return inflightPromise
}

export function useAdminBatchActions(): UseAdminBatchActionsResult {
  const [actions, setActions] = useState<BatchActions>(cachedActions ?? DEFAULT_ACTIONS)
  const [loading, setLoading] = useState(!cachedActions)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchBatchActions()
      setActions(result)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!cachedActions) {
      void refresh()
    }
  }, [refresh])

  return { actions, loading, refresh }
}
