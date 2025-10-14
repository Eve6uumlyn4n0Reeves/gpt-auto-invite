/**
 * 管理员限流仪表板组件
 */
'use client'

import React, { useState, useEffect } from 'react'
import {
  RateLimitStats,
  RateLimitConfig,
  rateLimitClient
} from '../lib/distributed-rate-limit'

interface RateLimitSummary {
  limiter_type: 'redis' | 'memory'
  status: string
  features: {
    distributed: boolean
    dynamic_config: boolean
    statistics: boolean
    top_denied: boolean
    fallback: boolean
  }
  active_configs?: string[]
}

interface TopDeniedItem {
  key: string
  denied_count: number
}

export function AdminRateLimitDashboard() {
  const [summary, setSummary] = useState<RateLimitSummary | null>(null)
  const [configs, setConfigs] = useState<Record<string, RateLimitConfig> | null>(null)
  const [topDenied, setTopDenied] = useState<TopDeniedItem[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [selectedStats, setSelectedStats] = useState<RateLimitStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [summaryData, configsData, topDeniedData] = await Promise.all([
        rateLimitClient.getSummary(),
        rateLimitClient.getConfigs(),
        rateLimitClient.getTopDenied(10)
      ])

      setSummary(summaryData)
      setConfigs(configsData)
      setTopDenied(topDeniedData)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取限流数据失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchKeyStats = async (key: string) => {
    try {
      const stats = await rateLimitClient.getStats(key)
      setSelectedStats(stats)
    } catch (err) {
      console.error('Failed to fetch key stats:', err)
    }
  }

  const handleKeySelect = (key: string) => {
    setSelectedKey(key)
    fetchKeyStats(key)
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-lg shadow">
                <div className="h-4 bg-gray-300 rounded w-3/4 mb-4"></div>
                <div className="h-2 bg-gray-300 rounded w-full"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-600">{error}</div>
          <button
            onClick={fetchDashboardData}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!summary) {
    return <div className="p-6">无数据</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">限流管理仪表板</h1>
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          刷新数据
        </button>
      </div>

      {/* 限流器状态摘要 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">限流器状态</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              summary.limiter_type === 'redis' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {summary.limiter_type === 'redis' ? 'Redis分布式' : '内存限流'}
            </div>
            <div className="text-xs text-gray-500 mt-1">限流器类型</div>
          </div>
          <div className="text-center">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              summary.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {summary.status === 'active' ? '运行中' : '异常'}
            </div>
            <div className="text-xs text-gray-500 mt-1">运行状态</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {summary.features.distributed ? '是' : '否'}
            </div>
            <div className="text-xs text-gray-500 mt-1">分布式支持</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {summary.features.dynamic_config ? '是' : '否'}
            </div>
            <div className="text-xs text-gray-500 mt-1">动态配置</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 限流配置 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">限流配置</h2>
          </div>
          <div className="p-6">
            {configs && Object.keys(configs).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(configs).map(([configId, config]) => (
                  <div key={configId} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900">{config.name}</h3>
                        <p className="text-sm text-gray-500">{configId}</p>
                      </div>
                      <span className="text-sm text-gray-600">{config.requestsPerPeriod}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">容量:</span>
                        <span className="ml-1 font-medium">{config.capacity}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">补充率:</span>
                        <span className="ml-1 font-medium">{config.refillRatePerMinute}/分钟</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                {summary.limiter_type === 'memory' ? '内存限流器不支持配置管理' : '暂无配置'}
              </div>
            )}
          </div>
        </div>

        {/* 被拒绝最多的键 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">被拒绝最多的键</h2>
          </div>
          <div className="p-6">
            {topDenied.length > 0 ? (
              <div className="space-y-3">
                {topDenied.map((item, index) => (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedKey === item.key ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => handleKeySelect(item.key)}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                          {item.key}
                        </div>
                        <div className="text-xs text-gray-500">
                          被拒绝 {item.denied_count} 次
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-red-600">
                      {item.denied_count}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                {summary.limiter_type === 'memory' ? '内存限流器不提供统计功能' : '暂无数据'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 选中键的详细统计 */}
      {selectedStats && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">
              键统计: {selectedKey}
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{selectedStats.allowed}</div>
                <div className="text-sm text-gray-500">允许请求</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{selectedStats.denied}</div>
                <div className="text-sm text-gray-500">拒绝请求</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{selectedStats.total}</div>
                <div className="text-sm text-gray-500">总请求数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {selectedStats.successRate.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">成功率</div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">剩余容量:</span>
                  <span className="ml-2 font-medium">{selectedStats.remaining}/{selectedStats.capacity}</span>
                </div>
                <div>
                  <span className="text-gray-500">当前使用率:</span>
                  <span className="ml-2 font-medium">{selectedStats.currentUsage.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-gray-500">最后允许:</span>
                  <span className="ml-2 font-medium">
                    {selectedStats.lastAllowed
                      ? new Date(selectedStats.lastAllowed * 1000).toLocaleString()
                      : '无记录'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
