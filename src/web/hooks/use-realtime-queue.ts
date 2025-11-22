'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Cookies from 'js-cookie'

export interface QueueUpdate {
  type: 'queue_update' | 'switch_completed' | 'switch_failed' | 'queue_status' | 'heartbeat' | 'pong'
  data?: {
    request_id?: number
    status?: string
    message?: string
    pending_count?: number
    email?: string
    result?: any
    timestamp?: string
    connected_at?: string
  }
}

export interface RealtimeQueueState {
  connected: boolean
  pendingCount: number
  updates: QueueUpdate[]
  lastUpdate: Date | null
}

export function useRealtimeQueue(enabled: boolean = true) {
  const [state, setState] = useState<RealtimeQueueState>({
    connected: false,
    pendingCount: 0,
    updates: [],
    lastUpdate: null,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // 获取会话 token
    const sessionId = Cookies.get('admin_session_id')
    if (!sessionId) {
      console.warn('No admin session found for WebSocket connection')
      return
    }

    try {
      // 根据当前协议选择 ws 或 wss
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const wsUrl = `${protocol}//${host}/api/admin/ws/switch-queue?token=${encodeURIComponent(sessionId)}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected')
        setState((prev) => ({ ...prev, connected: true }))

        // 启动心跳
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current)
        }
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          }
        }, 15000) // 每15秒发送一次ping
      }

      ws.onmessage = (event) => {
        try {
          const message: QueueUpdate = JSON.parse(event.data)
          
          setState((prev) => {
            const updates = [message, ...prev.updates].slice(0, 50) // 保留最近50条更新
            const newState = {
              ...prev,
              updates,
              lastUpdate: new Date(),
            }

            // 更新待处理数量
            if (message.type === 'queue_status' && message.data?.pending_count !== undefined) {
              newState.pendingCount = message.data.pending_count
            }

            return newState
          })
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        setState((prev) => ({ ...prev, connected: false }))

        // 停止心跳
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current)
          heartbeatIntervalRef.current = null
        }

        // 5秒后尝试重连
        if (enabled && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null
            connect()
          }, 5000)
        }
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
    }
  }, [enabled])

  useEffect(() => {
    connect()

    return () => {
      // 清理
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const clearUpdates = useCallback(() => {
    setState((prev) => ({ ...prev, updates: [] }))
  }, [])

  return {
    ...state,
    clearUpdates,
    reconnect: connect,
  }
}

