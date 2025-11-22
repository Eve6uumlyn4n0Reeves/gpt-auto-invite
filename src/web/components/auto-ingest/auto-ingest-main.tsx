/**
 * 母号自动化录入主组件
 */
'use client'

import { useState } from 'react'
import { ArrowLeft, Rocket, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CookieDetector } from './CookieDetector'
import { PoolGroupSelector } from './PoolGroupSelector'
import { autoIngestApi, AutoIngestRequest, AutoIngestResponse, TeamInfo } from '@/lib/api/auto-ingest'
import { toast } from 'sonner'

export function AutoIngestMain() {
  const [currentStep, setCurrentStep] = useState(1)
  const [cookieString, setCookieString] = useState('')
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null)
  const [poolGroupType, setPoolGroupType] = useState<'existing' | 'new'>('existing')
  const [poolGroupData, setPoolGroupData] = useState<{ id?: number; name?: string }>({})
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<AutoIngestResponse | null>(null)

  const totalSteps = 3
  const progressPercentage = (currentStep / totalSteps) * 100

  // 处理Cookie变化
  const handleCookieChange = (cookie: string, info?: TeamInfo) => {
    setCookieString(cookie)
    setTeamInfo(info || null)
    if (info && info.valid) {
      setCurrentStep(2)
    }
  }

  // 处理号池组选择
  const handlePoolGroupChange = (type: 'existing' | 'new', data: { id?: number; name?: string }) => {
    setPoolGroupType(type)
    setPoolGroupData(data)
    if ((type === 'existing' && data.id) || (type === 'new' && data.name)) {
      setCurrentStep(3)
    }
  }

  // 执行自动化录入
  const handleAutoIngest = async () => {
    if (!cookieString || !teamInfo?.valid) {
      toast.error('请先验证Cookie')
      return
    }

    if (!poolGroupData.id && !poolGroupData.name) {
      toast.error('请选择号池组')
      return
    }

    setProcessing(true)

    try {
      const request: AutoIngestRequest = {
        cookie_string: cookieString,
        ...(poolGroupType === 'existing'
          ? { pool_group_id: poolGroupData.id }
          : { pool_group_name: poolGroupData.name }
        )
      }

      const response = await autoIngestApi.ingestMother(request)
      setResult(response)

      if (response.success) {
        toast.success('母号录入成功！')
        setCurrentStep(4)
      } else {
        toast.error('母号录入失败', {
          description: response.error || '未知错误'
        })
      }
    } catch (error) {
      console.error('录入失败:', error)
      toast.error('母号录入失败', {
        description: error instanceof Error ? error.message : '网络错误'
      })
    } finally {
      setProcessing(false)
    }
  }

  // 重置流程
  const handleReset = () => {
    setCurrentStep(1)
    setCookieString('')
    setTeamInfo(null)
    setPoolGroupType('existing')
    setPoolGroupData({})
    setResult(null)
  }

  // 重新开始
  const handleStartOver = () => {
    handleReset()
  }

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/mothers">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回母号管理
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">母号自动化录入</h1>
            <p className="text-gray-600">从ChatGPT Cookie快速录入母号到号池组</p>
          </div>
        </div>
      </div>

      {/* 进度指示器 */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">录入进度</span>
              <span className="text-gray-500">
                {Math.min(currentStep, totalSteps)} / {totalSteps}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>1. Cookie验证</span>
              <span>2. 号池组选择</span>
              <span>3. 执行录入</span>
              {currentStep === 4 && <span>✓ 完成</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 主要内容区域 */}
      {currentStep < 4 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：当前步骤 */}
          <div className="lg:col-span-2 space-y-6">
            {currentStep === 1 && (
              <CookieDetector onCookieChange={handleCookieChange} />
            )}

            {currentStep >= 2 && (
              <PoolGroupSelector onPoolGroupChange={handlePoolGroupChange} />
            )}

            {currentStep === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Rocket className="h-5 w-5" />
                    执行自动化录入
                  </CardTitle>
                  <CardDescription>
                    确认信息无误后，点击开始录入
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 信息确认 */}
                  <div className="space-y-3">
                    <h4 className="font-medium">📋 录入信息确认</h4>

                    {teamInfo && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">邮箱:</span>
                          <div className="font-medium">{teamInfo.email}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">团队ID:</span>
                          <div className="font-medium">{teamInfo.team_id}</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <span className="text-gray-600">号池组:</span>
                      <div className="font-medium">
                        {poolGroupType === 'existing'
                          ? `现有号池组 (ID: ${poolGroupData.id})`
                          : `新号池组: ${poolGroupData.name}`
                        }
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* 执行按钮 */}
                  <Button
                    onClick={handleAutoIngest}
                    disabled={processing}
                    className="w-full"
                    size="lg"
                  >
                    {processing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        正在录入中...
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4 mr-2" />
                        开始自动录入
                      </>
                    )}
                  </Button>

                  {processing && (
                    <Alert>
                      <AlertDescription>
                        正在执行自动化录入，请稍候...
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右侧：信息面板 */}
          <div className="space-y-6">
            {/* 当前状态 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">当前状态</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span>Cookie验证</span>
                    {teamInfo?.valid ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        有效
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-red-100 text-red-800">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        无效
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span>号池组选择</span>
                    {(poolGroupData.id || poolGroupData.name) ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        已选择
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                        待选择
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span>执行录入</span>
                    {result?.success ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        成功
                      </Badge>
                    ) : currentStep === 3 ? (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        待执行
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                        未就绪
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 使用提示 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">💡 使用提示</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>• 确保在ChatGPT页面使用此功能以自动检测Cookie</p>
                  <p>• 录入的母号可用于后续的邀请操作</p>
                  <p>• 每个母号只能录入一次，重复录入会更新现有记录</p>
                  <p>• Cookie有效期通常为30天，过期后需要重新获取</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* 结果页面 */
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              {result?.success ? (
                <>
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <CardTitle className="text-2xl text-green-800">录入成功！</CardTitle>
                  <CardDescription>
                    母号已成功录入到号池组系统
                  </CardDescription>
                </>
              ) : (
                <>
                  <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="h-8 w-8 text-red-600" />
                  </div>
                  <CardTitle className="text-2xl text-red-800">录入失败</CardTitle>
                  <CardDescription>
                    {result?.error || '发生未知错误'}
                  </CardDescription>
                </>
              )}
            </CardHeader>

            {result?.success && result.mother && (
              <CardContent className="space-y-4">
                <Separator />
                <div className="space-y-3">
                  <h4 className="font-medium">📊 录入结果详情</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">母号ID:</span>
                      <div className="font-medium">#{result.mother.id}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">邮箱:</span>
                      <div className="font-medium">{result.mother.email}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">团队ID:</span>
                      <div className="font-medium">{result.mother.team_id}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">号池组:</span>
                      <div className="font-medium">{result.mother.pool_group_name}</div>
                    </div>
                  </div>

                  {result.team && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Team名称:</span>
                        <div className="font-medium">{result.team.team_name || '默认名称'}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">状态:</span>
                        <div className="font-medium">
                          {result.team.is_enabled ? '启用' : '禁用'}
                          {result.team.is_default && ' (默认)'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex gap-4">
                  <Link href="/admin/mothers">
                    <Button className="flex-1">
                      查看母号列表
                    </Button>
                  </Link>
                  <Button variant="outline" onClick={handleStartOver}>
                    录入更多母号
                  </Button>
                </div>
              </CardContent>
            )}

            {!result?.success && (
              <CardContent className="space-y-4">
                <Separator />
                <div className="flex gap-4">
                  <Button variant="outline" onClick={handleStartOver} className="flex-1">
                    重新尝试
                  </Button>
                  <Link href="/admin/mothers">
                    <Button variant="outline">
                      返回母号管理
                    </Button>
                  </Link>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}