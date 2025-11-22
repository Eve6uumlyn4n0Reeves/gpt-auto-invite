'use client'

import { useCallback } from 'react'
import { useAdminActions } from '@/store/admin-context'

function extractMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  return fallback
}

export function useErrorNotifier() {
  const { setError } = useAdminActions()

  const notifyError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      const message = extractMessage(error, fallbackMessage)
      setError(message)
      return message
    },
    [setError],
  )

  return { notifyError }
}

