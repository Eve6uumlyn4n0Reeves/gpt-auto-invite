/**
 * Cookie检测和预览组件
 */
'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CookieDetector as CookieDetectorUtil } from '@/lib/cookie-detector'
import { autoIngestApi, TeamInfo } from '@/lib/api/auto-ingest'
import { toast } from 'sonner'

interface CookieDetectorProps {
  onCookieChange: (cookie: string, teamInfo?: TeamInfo) => void
}

export function CookieDetector({ onCookieChange }: CookieDetectorProps) {
  const [cookieInfo, setCookieInfo] = useState(CookieDetectorUtil.detectCookie())
  const [manualCookie, setManualCookie] = useState('')
  const [showCookie, setShowCookie] = useState(false)
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null)
  const [validating, setValidating] = useState(false)

  // 初始检测
  useEffect(() => {
    if (cookieInfo.available && cookieInfo.cookieString) {
      validateCookie(cookieInfo.cookieString)
    }
  }, [])

  // 验证Cookie
  const validateCookie = async (cookieString: string) => {
    setValidating(true)
    try {
      const validation = CookieDetectorUtil.validateCookieFormat(cookieString)
      if (!validation.valid) {
        toast.error('Cookie格式验证失败', {
          description: validation.issues.join(', ')
        })
        onCookieChange('')
        return
      }

      // 调用API验证
      const info = await autoIngestApi.getCurrentTeamInfo(cookieString)
      setTeamInfo(info)

      if (info.valid) {
        toast.success('Cookie验证成功')
        onCookieChange(cookieString, info)
      } else {
        toast.error('Cookie验证失败', {
          description: info.error || '未知错误'
        })
        onCookieChange('')
      }
    } catch (error) {
      console.error('Cookie验证失败:', error)
      toast.error('Cookie验证失败', {
        description: error instanceof Error ? error.message : '网络错误'
      })
      onCookieChange('')
    } finally {
      setValidating(false)
    }
  }

  // 手动输入Cookie验证
  const handleManualCookieValidate = () => {
    if (manualCookie.trim()) {
      validateCookie(manualCookie.trim())
    }
  }

  // 复制Cookie到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制到剪贴板')
    } catch (error) {
      toast.error('复制失败')
    }
  }

  // 刷新检测
  const refreshDetection = () => {
    const newInfo = CookieDetectorUtil.detectCookie()
    setCookieInfo(newInfo)
    if (newInfo.available && newInfo.cookieString) {
      validateCookie(newInfo.cookieString)
    }
  }

  const instructions = CookieDetectorUtil.getCookieInstructions()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🍪 Cookie检测
            {cookieInfo.available && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                自动检测到
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {cookieInfo.available
              ? `已检测到来自 ${cookieInfo.domain} 的Cookie`
              : '未检测到Cookie，请手动输入'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="auto" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="auto">自动检测</TabsTrigger>
              <TabsTrigger value="manual">手动输入</TabsTrigger>
            </TabsList>

            <TabsContent value="auto" className="space-y-4">
              {cookieInfo.available ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">检测到的Cookie</label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCookie(!showCookie)}
                        >
                          {showCookie ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          {showCookie ? '隐藏' : '显示'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(cookieInfo.cookieString)}
                        >
                          <Copy className="h-4 w-4" />
                          复制
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={refreshDetection}
                          disabled={validating}
                        >
                          <RefreshCw className={`h-4 w-4 ${validating ? 'animate-spin' : ''}`} />
                          刷新
                        </Button>
                      </div>
                    </div>

                    <Textarea
                      value={showCookie ? cookieInfo.cookieString : '•'.repeat(cookieInfo.cookieString.length)}
                      readOnly
                      placeholder="Cookie内容将显示在这里"
                      className="font-mono text-xs"
                      rows={4}
                    />

                    {teamInfo && (
                      <Alert className={teamInfo.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                        {teamInfo.valid ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        <AlertDescription>
                          {teamInfo.valid ? (
                            <div className="space-y-1">
                              <p><strong>邮箱:</strong> {teamInfo.email}</p>
                              <p><strong>团队ID:</strong> {teamInfo.team_id}</p>
                              <p><strong>Token状态:</strong> {teamInfo.has_token ? '有效' : '无效'}</p>
                              {teamInfo.expires_at && (
                                <p><strong>过期时间:</strong> {new Date(teamInfo.expires_at).toLocaleString()}</p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <p><strong>验证失败:</strong> {teamInfo.error}</p>
                              {teamInfo.error_type && (
                                <p className="text-xs text-gray-500">错误类型: {teamInfo.error_type}</p>
                              )}
                            </div>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}

                    {validating && (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                        正在验证Cookie...
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>未检测到有效的Cookie</p>
                  <p className="text-sm">请确保在ChatGPT页面使用此功能，或切换到手动输入</p>
                    <Button variant="outline" onClick={refreshDetection} className="mt-4">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      重新检测
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="manual" className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">手动输入Cookie</label>
                  <Textarea
                    value={manualCookie}
                    onChange={(e) => setManualCookie(e.target.value)}
                    placeholder="请粘贴完整的Cookie字符串..."
                    className="font-mono text-xs"
                    rows={6}
                  />
                </div>

                <Button
                  onClick={handleManualCookieValidate}
                  disabled={!manualCookie.trim() || validating}
                  className="w-full"
                >
                  {validating && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                  验证Cookie
                </Button>

                {teamInfo && teamInfo.valid && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      <div className="space-y-1">
                        <p><strong>邮箱:</strong> {teamInfo.email}</p>
                        <p><strong>团队ID:</strong> {teamInfo.team_id}</p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 使用说明 */}
      <Card>
        <CardHeader>
          <CardTitle>{instructions.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">操作步骤:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                {instructions.steps.map((step: string, index: number) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>

            <div>
              <h4 className="font-medium mb-2">💡 提示:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                {instructions.tips.map((tip: string, index: number) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
