'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { SettingsSection } from '@/components/admin/sections/settings-section'
import { importCookie as apiImportCookie, logoutAll as apiLogoutAll } from '@/lib/api/settings'
import { useNotifications } from '@/components/notification-system'
import { getPerformanceStats, togglePerformance, resetPerformance } from '@/lib/api/performance'
import type { ImportCookieResult, PerformanceStatsResponse } from '@/types/admin'
import { useAdminCsrfToken } from '@/hooks/use-admin-csrf-token'

export function SettingsView() {
  const { ensureCsrfToken, resetCsrfToken } = useAdminCsrfToken()
  const notifications = useNotifications()

  const [changePasswordForm, setChangePasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null)
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)

  const [importCookieInput, setImportCookieInput] = useState('')
  const [importCookieError, setImportCookieError] = useState<string | null>(null)
  const [importCookieLoading, setImportCookieLoading] = useState(false)
  const [importCookieResult, setImportCookieResult] = useState<ImportCookieResult | null>(null)

  const [logoutAllLoading, setLogoutAllLoading] = useState(false)

  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [performanceError, setPerformanceError] = useState<string | null>(null)
  const [performanceStats, setPerformanceStats] = useState<PerformanceStatsResponse | null>(null)

  const fetchPerformanceStats = useCallback(async () => {
    setPerformanceLoading(true)
    setPerformanceError(null)
    try {
      const res = await getPerformanceStats()
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '加载性能统计失败')
      }
      setPerformanceStats(res.data as PerformanceStatsResponse)
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载性能统计失败'
      setPerformanceError(message)
    } finally {
      setPerformanceLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPerformanceStats()
  }, [fetchPerformanceStats])

  const handleChangePasswordSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const { oldPassword, newPassword, confirmPassword } = changePasswordForm
      if (!oldPassword || !newPassword || !confirmPassword) {
        setChangePasswordError('请完整填写所有字段')
        return
      }
      if (newPassword.length < 8) {
        setChangePasswordError('新密码长度至少 8 位')
        return
      }
      if (newPassword !== confirmPassword) {
        setChangePasswordError('两次输入的新密码不一致')
        return
      }

      setChangePasswordLoading(true)
      setChangePasswordError(null)
      try {
        const response = await fetch('/api/admin/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Source': 'nextjs-frontend',
          },
          body: JSON.stringify({
            old_password: oldPassword,
            new_password: newPassword,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data?.success === false) {
          throw new Error(data?.message || data?.detail || '修改密码失败')
        }
        notifications.addNotification({
          type: 'success',
          title: '密码已更新',
          message: '请妥善保管新的管理员密码',
        })
        setChangePasswordForm({
          oldPassword: '',
          newPassword: '',
          confirmPassword: '',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : '修改密码失败'
        setChangePasswordError(message)
        notifications.addNotification({
          type: 'error',
          title: '修改密码失败',
          message,
        })
      } finally {
        setChangePasswordLoading(false)
      }
    },
    [changePasswordForm, notifications],
  )

  const handleImportCookieSubmit = useCallback(async () => {
    if (!importCookieInput.trim()) {
      setImportCookieError('请输入 Cookie 内容')
      return
    }

    setImportCookieLoading(true)
    setImportCookieError(null)
    setImportCookieResult(null)
    try {
      const resp = await apiImportCookie({ cookie: importCookieInput })
      if (!('ok' in resp) || !resp.ok) {
        throw new Error(resp.error || '解析 Cookie 失败')
      }
      setImportCookieResult(resp.data as ImportCookieResult)
      notifications.addNotification({
        type: 'success',
        title: '令牌已生成',
        message: '已提取访问令牌，可在新增母号中使用',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '解析 Cookie 失败'
      setImportCookieError(message)
      notifications.addNotification({
        type: 'error',
        title: '解析失败',
        message,
      })
    } finally {
      setImportCookieLoading(false)
    }
  }, [ensureCsrfToken, importCookieInput, notifications, resetCsrfToken])

  const handleLogoutAll = useCallback(async () => {
    setLogoutAllLoading(true)
    try {
      const resp = await apiLogoutAll()
      if (!('ok' in resp) || !resp.ok) {
        throw new Error(resp.error || '撤销会话失败')
      }
      notifications.addNotification({
        type: 'success',
        title: '会话已撤销',
        message: '所有管理员会话已失效，请重新登录',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '撤销会话失败'
      notifications.addNotification({
        type: 'error',
        title: '撤销失败',
        message,
      })
    } finally {
      setLogoutAllLoading(false)
    }
  }, [notifications])

  const handlePerformanceToggle = useCallback(async () => {
    try {
      const res = await togglePerformance()
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '切换性能监控失败')
      }
      notifications.addNotification({
        type: 'success',
        title: '性能监控已更新',
        message: (res.data as any)?.message || '监控状态已切换',
      })
      await fetchPerformanceStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : '切换性能监控失败'
      setPerformanceError(message)
      notifications.addNotification({
        type: 'error',
        title: '切换失败',
        message,
      })
    }
  }, [fetchPerformanceStats, notifications])

  const handlePerformanceReset = useCallback(async () => {
    try {
      const res = await resetPerformance()
      if (!('ok' in res) || !res.ok) {
        throw new Error(res.error || '重置性能统计失败')
      }
      notifications.addNotification({
        type: 'success',
        title: '性能统计已重置',
        message: (res.data as any)?.message || '性能统计数据已清空',
      })
      await fetchPerformanceStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : '重置性能统计失败'
      setPerformanceError(message)
      notifications.addNotification({
        type: 'error',
        title: '重置失败',
        message,
      })
    }
  }, [fetchPerformanceStats, notifications])

  return (
    <SettingsSection
      changePasswordForm={changePasswordForm}
      changePasswordError={changePasswordError}
      changePasswordLoading={changePasswordLoading}
      onChangePasswordSubmit={handleChangePasswordSubmit}
      onChangePasswordField={(field, value) =>
        setChangePasswordForm((prev) => ({
          ...prev,
          [field]: value,
        }))
      }
      importCookieInput={importCookieInput}
      importCookieError={importCookieError}
      importCookieLoading={importCookieLoading}
      importCookieResult={importCookieResult}
      onImportCookieInputChange={setImportCookieInput}
      onImportCookieClear={() => {
        setImportCookieInput('')
        setImportCookieError(null)
        setImportCookieResult(null)
      }}
      onImportCookieSubmit={handleImportCookieSubmit}
      logoutAllLoading={logoutAllLoading}
      onLogoutAll={handleLogoutAll}
      performanceLoading={performanceLoading}
      performanceError={performanceError}
      performanceStats={performanceStats}
      onRefreshPerformance={fetchPerformanceStats}
      onTogglePerformance={handlePerformanceToggle}
      onResetPerformance={handlePerformanceReset}
    />
  )
}
