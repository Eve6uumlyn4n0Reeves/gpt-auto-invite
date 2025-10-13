'use client'

import { useCallback } from 'react'
import { useAdminContext } from '@/store/admin-context'

// 获取API基础URL
const getApiBaseUrl = () => {
  // 在客户端，使用相对路径让Next.js处理代理
  if (typeof window !== 'undefined') {
    return ''
  }
  // 在服务端，直接使用后端URL
  return process.env.BACKEND_URL || 'http://localhost:8000'
}

export const useAdminSimple = () => {
  const { state, dispatch } = useAdminContext()

  const apiCall = useCallback(async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> => {
    try {
      const baseUrl = getApiBaseUrl()
      const url = `${baseUrl}/api/admin${endpoint}`

      console.log(`[Admin API] ${options.method || 'GET'} ${url}`)

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Source': 'nextjs-frontend',
          ...options.headers,
        },
        ...options,
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: data.message || data.detail || `HTTP ${response.status}`,
        }
      }

      return {
        success: true,
        data,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络错误',
      }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      const baseUrl = getApiBaseUrl()
      const url = `${baseUrl}/api/admin/logout`
      console.log(`[Admin API] POST ${url}`)

      await fetch(url, {
        method: 'POST',
        headers: {
          'X-Request-Source': 'nextjs-frontend',
        },
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      dispatch({ type: 'RESET_AUTH' })
      dispatch({ type: 'RESET_DATA' })
    }
  }, [dispatch])

  const loadStats = useCallback(async () => {
    dispatch({ type: 'SET_STATS_LOADING', payload: true })

    try {
      const baseUrl = getApiBaseUrl()
      const url = `${baseUrl}/api/admin/stats`
      console.log(`[Admin API] GET ${url}`)

      const response = await fetch(url, {
        headers: {
          'X-Request-Source': 'nextjs-frontend',
        },
      })
      if (response.ok) {
        const data = await response.json()
        dispatch({ type: 'SET_STATS', payload: data })
        dispatch({
          type: 'SET_SERVICE_STATUS',
          payload: {
            backend: 'online',
            lastCheck: new Date(),
          },
        })
      } else {
        const errorData = await response.json().catch(() => ({ message: '服务不可用' }))
        if (response.status === 503 || response.status === 502) {
          console.error('后端服务不可用')
          dispatch({ type: 'SET_STATS', payload: null })
          dispatch({
            type: 'SET_SERVICE_STATUS',
            payload: {
              backend: 'offline',
              lastCheck: new Date(),
            },
          })
        } else {
          console.error('加载统计数据失败:', errorData.message)
          dispatch({ type: 'SET_STATS', payload: null })
        }
      }
    } catch (error) {
      console.error('Load stats error:', error)
      dispatch({ type: 'SET_STATS', payload: null })
      dispatch({
        type: 'SET_SERVICE_STATUS',
        payload: {
          backend: 'offline',
          lastCheck: new Date(),
        },
      })
    } finally {
      dispatch({ type: 'SET_STATS_LOADING', payload: false })
    }
  }, [dispatch])

  const loadMothers = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })

    try {
      const baseUrl = getApiBaseUrl()
      const url = `${baseUrl}/api/admin/mothers`
      console.log(`[Admin API] GET ${url}`)

      const response = await fetch(url, {
        headers: {
          'X-Request-Source': 'nextjs-frontend',
        },
      })
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          const validatedMothers = data.map((mother) => ({
            ...mother,
            seat_limit: Math.min(mother.seat_limit || 7, 7),
          }))
          dispatch({ type: 'SET_MOTHERS', payload: validatedMothers })
          dispatch({
            type: 'SET_SERVICE_STATUS',
            payload: {
              backend: 'online',
              lastCheck: new Date(),
            },
          })
        } else {
          dispatch({ type: 'SET_MOTHERS', payload: [] })
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: '服务不可用' }))
        if (response.status === 503) {
          dispatch({ type: 'SET_ERROR', payload: '后端服务暂时不可用，请稍后重试' })
          dispatch({
            type: 'SET_SERVICE_STATUS',
            payload: {
              backend: 'offline',
              lastCheck: new Date(),
            },
          })
        } else if (response.status === 502) {
          dispatch({ type: 'SET_ERROR', payload: '后端服务连接失败，请检查服务状态' })
          dispatch({
            type: 'SET_SERVICE_STATUS',
            payload: {
              backend: 'offline',
              lastCheck: new Date(),
            },
          })
        } else {
          dispatch({ type: 'SET_ERROR', payload: errorData.message || '加载母账号失败' })
        }
        dispatch({ type: 'SET_MOTHERS', payload: [] })
      }
    } catch (error) {
      console.error('Load mothers error:', error)
      dispatch({ type: 'SET_ERROR', payload: '网络连接失败，请检查网络连接' })
      dispatch({ type: 'SET_MOTHERS', payload: [] })
      dispatch({
        type: 'SET_SERVICE_STATUS',
        payload: {
          backend: 'offline',
          lastCheck: new Date(),
        },
      })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [dispatch])

  const checkAuth = useCallback(async () => {
    try {
      const baseUrl = getApiBaseUrl()
      const url = `${baseUrl}/api/admin/me`
      console.log(`[Admin API] GET ${url}`)

      const response = await fetch(url, {
        headers: {
          'X-Request-Source': 'nextjs-frontend',
        },
      })
      const data = await response.json()

      dispatch({ type: 'SET_AUTHENTICATED', payload: data.authenticated })

      if (data.authenticated) {
        loadMothers()
        loadStats()
      }

      return data.authenticated
    } catch (error) {
      console.error('Auth check error:', error)
      dispatch({ type: 'SET_AUTHENTICATED', payload: false })
      return false
    }
  }, [dispatch, loadMothers, loadStats])

  const login = useCallback(async (password: string) => {
    dispatch({ type: 'SET_LOGIN_LOADING', payload: true })
    dispatch({ type: 'SET_LOGIN_ERROR', payload: '' })

    try {
      const baseUrl = getApiBaseUrl()
      const url = `${baseUrl}/api/admin/login`
      console.log(`[Admin API] POST ${url}`)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Source': 'nextjs-frontend',
        },
        body: JSON.stringify({ password }),
      })

      if (response.ok) {
        dispatch({ type: 'SET_AUTHENTICATED', payload: true })
        dispatch({ type: 'SET_LOGIN_PASSWORD', payload: '' })
        loadMothers()
        loadStats()
        return { success: true }
      } else {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.message || '密码错误'
        dispatch({ type: 'SET_LOGIN_ERROR', payload: errorMessage })
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '登录失败，请稍后重试'
      dispatch({ type: 'SET_LOGIN_ERROR', payload: errorMessage })
      return { success: false, error: errorMessage }
    } finally {
      dispatch({ type: 'SET_LOGIN_LOADING', payload: false })
    }
  }, [dispatch, loadMothers, loadStats])

  const loadUsers = useCallback(async () => {
    dispatch({ type: 'SET_USERS_LOADING', payload: true })

    try {
      const baseUrl = getApiBaseUrl()
      const url = `${baseUrl}/api/admin/users`
      console.log(`[Admin API] GET ${url}`)

      const response = await fetch(url, {
        headers: {
          'X-Request-Source': 'nextjs-frontend',
        },
      })
      if (response.ok) {
        const data = await response.json()
        dispatch({ type: 'SET_USERS', payload: data })
      } else {
        dispatch({ type: 'SET_ERROR', payload: '加载用户数据失败' })
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: '加载用户数据失败' })
    } finally {
      dispatch({ type: 'SET_USERS_LOADING', payload: false })
    }
  }, [dispatch])

  const loadCodes = useCallback(async () => {
    dispatch({ type: 'SET_CODES_LOADING', payload: true })

    try {
      const baseUrl = getApiBaseUrl()
      const url = `${baseUrl}/api/admin/codes`
      console.log(`[Admin API] GET ${url}`)

      const response = await fetch(url, {
        headers: {
          'X-Request-Source': 'nextjs-frontend',
        },
      })
      if (response.ok) {
        const data = await response.json()
        dispatch({ type: 'SET_CODES', payload: data })
      } else {
        dispatch({ type: 'SET_ERROR', payload: '加载兑换码数据失败' })
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: '加载兑换码数据失败' })
    } finally {
      dispatch({ type: 'SET_CODES_LOADING', payload: false })
    }
  }, [dispatch])

  

  const generateCodes = useCallback(async (count: number, prefix?: string) => {
    dispatch({ type: 'SET_GENERATE_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })

    try {
      const baseUrl = getApiBaseUrl()
      const url = `${baseUrl}/api/admin/codes`
      console.log(`[Admin API] POST ${url}`)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Source': 'nextjs-frontend',
        },
        body: JSON.stringify({ count, prefix: prefix || undefined }),
      })

      if (response.ok) {
        const data = await response.json()
        dispatch({ type: 'SET_GENERATED_CODES', payload: data.codes })
        dispatch({ type: 'SET_SHOW_GENERATED', payload: true })
        loadStats()
        if (state.codes.length > 0) {
          loadCodes()
        }
        return { success: true, data }
      } else {
        const data = await response.json().catch(() => ({ detail: undefined }))
        const errorMessage = data?.message || data?.detail || '生成兑换码失败'
        dispatch({ type: 'SET_ERROR', payload: errorMessage })
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '生成兑换码失败'
      dispatch({ type: 'SET_ERROR', payload: errorMessage })
      return { success: false, error: errorMessage }
    } finally {
      dispatch({ type: 'SET_GENERATE_LOADING', payload: false })
    }
  }, [dispatch, loadStats, loadCodes, state.codes.length])

  return {
    checkAuth,
    login,
    logout,
    loadMothers,
    loadUsers,
    loadCodes,
    loadStats,
    generateCodes,
    apiCall,
  }
}
