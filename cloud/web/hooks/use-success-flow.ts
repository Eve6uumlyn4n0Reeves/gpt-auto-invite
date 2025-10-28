'use client'

import { useRouter } from 'next/navigation'
import { useNotifications } from '@/components/notification-system'

type SuccessMeta = { title: string; message: string; navigateTo?: string; delayMs?: number }

export const useSuccessFlow = () => {
  const notifications = useNotifications()
  const router = useRouter()

  async function succeed<T>(task: () => Promise<T>, build: (data: T) => SuccessMeta) {
    try {
      const data = await task()
      const meta = build(data)
      notifications.addNotification({ type: 'success', title: meta.title, message: meta.message })
      if (meta.navigateTo) {
        setTimeout(() => router.push(meta.navigateTo!), meta.delayMs ?? 500)
      }
      return { ok: true as const, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失败'
      notifications.addNotification({ type: 'error', title: '操作失败', message })
      return { ok: false as const, error: message }
    }
  }

  return { succeed }
}

