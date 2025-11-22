/**
 * 限流状态显示组件
 */
'use client'

import React, { useState, useEffect } from 'react'
import {
  RateLimitStatus,
  RateLimitLevel,
  getRateLimitLevel,
  getRateLimitColor,
  getRateLimitBgColor,
  formatTimeToReset,
  rateLimitClient
} from '../lib/distributed-rate-limit'

interface RateLimitStatusProps {
  key: string
  showDetails?: boolean
  className?: string
}

interface RateLimitStatusDisplayProps {
  status: RateLimitStatus
  showDetails?: boolean
  className?: string
}

export function RateLimitStatusDisplay({
  status,
  showDetails = false,
  className = ''
}: RateLimitStatusDisplayProps) {
  const level = getRateLimitLevel(status.usagePercentage)
  const colorClass = getRateLimitColor(level)
  const bgColorClass = getRateLimitBgColor(level)

  return (
    <div className={`p-4 rounded-lg border ${bgColorClass} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`text-sm font-medium ${colorClass}`}>
            限流状态
          </div>
          {!status.allowed && (
            <span className="px-2 py-1 text-xs bg-red-500 text-white rounded">
              已限制
            </span>
          )}
        </div>

        <div className={`text-sm ${colorClass}`}>
          {status.info.remaining}/{status.info.limit}
        </div>
      </div>

      {/* 进度条 */}
      <div className="mt-3">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              level === 'low' ? 'bg-green-500' :
              level === 'medium' ? 'bg-yellow-500' :
              level === 'high' ? 'bg-orange-500' :
              'bg-red-500'
            }`}
            style={{ width: `${status.usagePercentage}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-500">
            使用率: {status.usagePercentage}%
          </span>
          <span className="text-xs text-gray-500">
            重置: {status.timeToReset}
          </span>
        </div>
      </div>

      {showDetails && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">限制数:</span>
              <span className="ml-1 font-medium">{status.info.limit}</span>
            </div>
            <div>
              <span className="text-gray-500">剩余:</span>
              <span className="ml-1 font-medium">{status.info.remaining}</span>
            </div>
            <div>
              <span className="text-gray-500">已用:</span>
              <span className="ml-1 font-medium">{status.info.limit - status.info.remaining}</span>
            </div>
            <div>
              <span className="text-gray-500">重置时间:</span>
              <span className="ml-1 font-medium">{new Date(status.info.resetTime * 1000).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function RateLimitStatusComponent({
  key,
  showDetails = false,
  className = ''
}: RateLimitStatusProps) {
  const [status, setStatus] = useState<RateLimitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const fetchStatus = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await rateLimitClient.getStatus(key)

        if (mounted) {
          setStatus(data)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : '获取限流状态失败')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchStatus()

    // 每30秒刷新一次状态
    const interval = setInterval(fetchStatus, 30000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [key])

  if (loading) {
    return (
      <div className={`p-4 rounded-lg border bg-gray-50 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 rounded w-1/4 mb-2"></div>
          <div className="h-2 bg-gray-300 rounded w-full"></div>
        </div>
      </div>
    )
  }

  if (error || !status) {
    return (
      <div className={`p-4 rounded-lg border bg-red-50 ${className}`}>
        <div className="text-sm text-red-600">
          {error || '限流状态不可用'}
        </div>
      </div>
    )
  }

  return (
    <RateLimitStatusDisplay
      status={status}
      showDetails={showDetails}
      className={className}
    />
  )
}

/**
 * 限流信息提示组件
 */
export function RateLimitTooltip({
  status,
  children
}: {
  status: RateLimitStatus
  children: React.ReactNode
}) {
  const level = getRateLimitLevel(status.usagePercentage)

  const getTooltipMessage = () => {
    if (!status.allowed) {
      return `请求已被限制，请在 ${status.timeToReset} 后重试`
    }

    switch (level) {
      case 'low':
        return '限流状态正常'
      case 'medium':
        return '限流使用率中等，请注意使用频率'
      case 'high':
        return '限流使用率较高，请适当降低使用频率'
      case 'critical':
        return '限流即将达到上限，请谨慎使用'
      default:
        return ''
    }
  }

  return (
    <div className="group relative inline-block">
      {children}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
        {getTooltipMessage()}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
          <div className="border-4 border-transparent border-t-gray-900"></div>
        </div>
      </div>
    </div>
  )
}
