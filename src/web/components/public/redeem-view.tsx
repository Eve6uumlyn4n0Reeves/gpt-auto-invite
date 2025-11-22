'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Mail, Ticket, ArrowRight, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function RedeemView() {
  const [activeTab, setActiveTab] = useState<'redeem' | 'switch' | 'refresh'>('redeem')
  
  // 兑换表单
  const [redeemEmail, setRedeemEmail] = useState('')
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemResult, setRedeemResult] = useState<{
    success: boolean
    message: string
    team_id?: string
  } | null>(null)

  // 切换表单
  const [switchEmail, setSwitchEmail] = useState('')
  const [switchCode, setSwitchCode] = useState('')
  const [switchLoading, setSwitchLoading] = useState(false)
  const [switchResult, setSwitchResult] = useState<{
    success: boolean
    message: string
    queued?: boolean
    request_id?: number
  } | null>(null)

  // 刷新表单
  const [refreshEmail, setRefreshEmail] = useState('')
  const [refreshCode, setRefreshCode] = useState('')
  const [refreshNewEmail, setRefreshNewEmail] = useState('')
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{
    success: boolean
    message: string
    queued?: boolean
    cooldown_seconds?: number
    refresh_remaining?: number | null
  } | null>(null)
  const [refreshConfirmStarted, setRefreshConfirmStarted] = useState(false)
  const [refreshCountdown, setRefreshCountdown] = useState(0)

  const handleRedeem = async () => {
    if (!redeemEmail || !redeemCode) {
      setRedeemResult({
        success: false,
        message: '请填写完整信息',
      })
      return
    }

    setRedeemLoading(true)
    setRedeemResult(null)

    try {
      const response = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: redeemEmail.trim(),
          code: redeemCode.trim(),
        }),
      })

      const data = await response.json()
      setRedeemResult(data)

      if (data.success) {
        // 清空表单
        setRedeemEmail('')
        setRedeemCode('')
      }
    } catch (error) {
      setRedeemResult({
        success: false,
        message: '网络错误，请稍后重试',
      })
    } finally {
      setRedeemLoading(false)
    }
  }

  const handleSwitch = async () => {
    if (!switchEmail || !switchCode) {
      setSwitchResult({
        success: false,
        message: '请填写完整信息',
      })
      return
    }

    setSwitchLoading(true)
    setSwitchResult(null)

    try {
      const response = await fetch('/api/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: switchEmail.trim(),
          code: switchCode.trim(),
        }),
      })

      const data = await response.json()
      setSwitchResult(data)

      if (data.success && !data.queued) {
        // 清空表单
        setSwitchEmail('')
        setSwitchCode('')
      }
    } catch (error) {
      setSwitchResult({
        success: false,
        message: '网络错误，请稍后重试',
      })
    } finally {
      setSwitchLoading(false)
    }
  }

  useEffect(() => {
    if (refreshCountdown <= 0) return
    const timer = setTimeout(() => setRefreshCountdown((prev) => Math.max(0, prev - 1)), 1000)
    return () => clearTimeout(timer)
  }, [refreshCountdown])

  const startRefreshCountdown = () => {
    setRefreshConfirmStarted(true)
    setRefreshCountdown(5)
  }

  const handleRefresh = async () => {
    if (!refreshEmail || !refreshCode) {
      setRefreshResult({
        success: false,
        message: '请填写邮箱与兑换码',
      })
      return
    }
    if (!refreshConfirmStarted || refreshCountdown > 0) {
      setRefreshResult({
        success: false,
        message: '请先阅读提示并完成 5 秒倒计时，确认风险后再刷新。',
      })
      return
    }

    setRefreshLoading(true)
    setRefreshResult(null)

    try {
      const response = await fetch('/api/redeem/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: refreshEmail.trim(),
          code: refreshCode.trim(),
          new_email: refreshNewEmail.trim() || undefined,
        }),
      })
      const data = await response.json()
      setRefreshResult(data)
      if (data.success) {
        setRefreshEmail('')
        setRefreshCode('')
        setRefreshNewEmail('')
      }
    } catch (error) {
      setRefreshResult({
        success: false,
        message: '网络错误，请稍后再试',
      })
    } finally {
      setRefreshLoading(false)
      setRefreshConfirmStarted(false)
      setRefreshCountdown(0)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* 头部 */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-secondary shadow-lg mb-4">
            <span className="text-3xl">⚙️</span>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            GPT 团队邀请服务
          </h1>
          <p className="text-muted-foreground mt-2">使用兑换码加入 ChatGPT 企业团队</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'redeem' | 'switch' | 'refresh')} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="redeem" className="gap-2">
              <Ticket className="h-4 w-4" />
              兑换席位
            </TabsTrigger>
            <TabsTrigger value="switch" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              切换团队
            </TabsTrigger>
            <TabsTrigger value="refresh" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              刷新/换绑
            </TabsTrigger>
          </TabsList>

          {/* 兑换页面 */}
          <TabsContent value="redeem">
            <Card className="border-border/40 shadow-xl">
              <CardHeader>
                <CardTitle>兑换席位</CardTitle>
                <CardDescription>首次使用？输入您的邮箱和兑换码来加入团队</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="redeem-email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    邮箱地址
                  </Label>
                  <Input
                    id="redeem-email"
                    type="email"
                    placeholder="your@email.com"
                    value={redeemEmail}
                    onChange={(e) => setRedeemEmail(e.target.value)}
                    disabled={redeemLoading}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="redeem-code" className="flex items-center gap-2">
                    <Ticket className="h-4 w-4" />
                    兑换码
                  </Label>
                  <Input
                    id="redeem-code"
                    type="text"
                    placeholder="输入您的兑换码"
                    value={redeemCode}
                    onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                    disabled={redeemLoading}
                    className="h-11 font-mono"
                  />
                </div>

                {redeemResult && (
                  <Alert variant={redeemResult.success ? 'default' : 'destructive'}>
                    {redeemResult.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>
                      {redeemResult.success ? '兑换成功！' : '兑换失败'}
                    </AlertTitle>
                    <AlertDescription>{redeemResult.message}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleRedeem}
                  disabled={redeemLoading || !redeemEmail || !redeemCode}
                  className="w-full h-11 text-base"
                  size="lg"
                >
                  {redeemLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      兑换中...
                    </>
                  ) : (
                    <>
                      兑换席位
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                <div className="text-xs text-muted-foreground text-center pt-2 space-y-1">
                  <p>兑换成功后，系统将向您的邮箱发送团队邀请</p>
                  <p>请检查邮箱并接受邀请以完成加入</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 切换页面 */}
          <TabsContent value="switch">
            <Card className="border-border/40 shadow-xl">
              <CardHeader>
                <CardTitle>切换团队</CardTitle>
                <CardDescription>已有席位？切换到新的团队继续使用</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="switch-email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    邮箱地址
                  </Label>
                  <Input
                    id="switch-email"
                    type="email"
                    placeholder="your@email.com"
                    value={switchEmail}
                    onChange={(e) => setSwitchEmail(e.target.value)}
                    disabled={switchLoading}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="switch-code" className="flex items-center gap-2">
                    <Ticket className="h-4 w-4" />
                    兑换码
                  </Label>
                  <Input
                    id="switch-code"
                    type="text"
                    placeholder="输入您的兑换码"
                    value={switchCode}
                    onChange={(e) => setSwitchCode(e.target.value.toUpperCase())}
                    disabled={switchLoading}
                    className="h-11 font-mono"
                  />
                </div>

                {switchResult && (
                  <Alert variant={switchResult.success ? 'default' : switchResult.queued ? 'default' : 'destructive'}>
                    {switchResult.success || switchResult.queued ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>
                      {switchResult.success
                        ? '切换成功！'
                        : switchResult.queued
                          ? '已加入排队'
                          : '切换失败'}
                    </AlertTitle>
                    <AlertDescription>
                      {switchResult.message}
                      {switchResult.queued && switchResult.request_id && (
                        <span className="block mt-1 text-xs">
                          排队号: #{switchResult.request_id}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleSwitch}
                  disabled={switchLoading || !switchEmail || !switchCode}
                  className="w-full h-11 text-base"
                  size="lg"
                >
                  {switchLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      切换中...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      切换团队
                    </>
                  )}
                </Button>

                <div className="text-xs text-muted-foreground text-center pt-2 space-y-1">
                  <p>切换将从您当前团队移除，并加入新的团队</p>
                  <p>如果当前无可用席位，将自动加入排队等待</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 刷新页面 */}
          <TabsContent value="refresh">
            <Card className="border-border/40 shadow-xl">
              <CardHeader>
                <CardTitle>刷新席位 / 换绑邮箱</CardTitle>
                <CardDescription>将当前席位踢出后重新分配至新的团队，可选换绑邮箱</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>注意：刷新将丢失历史记录</AlertTitle>
                  <AlertDescription>
                    刷新会将当前团队中的聊天记录、收藏和设置全部清除，请提前备份。系统会在刷新完成后为您分配新的团队。
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="refresh-email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    当前绑定邮箱
                  </Label>
                  <Input
                    id="refresh-email"
                    type="email"
                    placeholder="目前绑定的邮箱"
                    value={refreshEmail}
                    onChange={(e) => setRefreshEmail(e.target.value)}
                    disabled={refreshLoading}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refresh-code" className="flex items-center gap-2">
                    <Ticket className="h-4 w-4" />
                    兑换码
                  </Label>
                  <Input
                    id="refresh-code"
                    type="text"
                    placeholder="请输入兑换码"
                    value={refreshCode}
                    onChange={(e) => setRefreshCode(e.target.value.toUpperCase())}
                    disabled={refreshLoading}
                    className="h-11 font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refresh-new-email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    新邮箱（可选）
                  </Label>
                  <Input
                    id="refresh-new-email"
                    type="email"
                    placeholder="若需换绑，请填写新邮箱"
                    value={refreshNewEmail}
                    onChange={(e) => setRefreshNewEmail(e.target.value)}
                    disabled={refreshLoading}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">若不填写，将继续绑定原邮箱。</p>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3 bg-muted/30">
                  <p className="text-sm text-muted-foreground">为避免误操作，请先确认已备份数据并启动 5 秒倒计时。</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={startRefreshCountdown}
                      disabled={refreshLoading}
                    >
                      {refreshCountdown > 0 ? `倒计时 ${refreshCountdown}s` : '开始倒计时'}
                    </Button>
                    <Button
                      onClick={handleRefresh}
                      disabled={
                        refreshLoading ||
                        !refreshEmail ||
                        !refreshCode ||
                        !refreshConfirmStarted ||
                        refreshCountdown > 0
                      }
                      className="flex-1 h-11 text-base"
                    >
                      {refreshLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          刷新中...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          确认刷新
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {refreshResult && (
                  <Alert variant={refreshResult.success ? 'default' : refreshResult.queued ? 'default' : 'destructive'}>
                    {refreshResult.success || refreshResult.queued ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{refreshResult.success ? '刷新成功' : refreshResult.queued ? '刷新排队中' : '刷新失败'}</AlertTitle>
                    <AlertDescription>
                      {refreshResult.message}
                      {typeof refreshResult.refresh_remaining === 'number' && (
                        <span className="block mt-1 text-xs">
                          剩余刷新次数：{refreshResult.refresh_remaining < 0 ? '不限' : refreshResult.refresh_remaining}
                        </span>
                      )}
                      {typeof refreshResult.cooldown_seconds === 'number' && refreshResult.cooldown_seconds > 0 && (
                        <span className="block mt-1 text-xs text-muted-foreground">
                          冷却中：请等待 {Math.ceil(refreshResult.cooldown_seconds / 60)} 分钟后再试
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 使用说明 */}
        <Card className="mt-6 border-border/40 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">使用说明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs shrink-0 mt-0.5">
                1
              </div>
              <div>
                <span className="font-medium text-foreground">首次使用</span>：选择"兑换席位"，输入邮箱和兑换码
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs shrink-0 mt-0.5">
                2
              </div>
              <div>
                <span className="font-medium text-foreground">切换团队</span>：如需更换团队，选择"切换团队"标签页
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs shrink-0 mt-0.5">
                3
              </div>
              <div>
                <span className="font-medium text-foreground">刷新/换绑</span>：需要新的团队或更换邮箱时，请使用"刷新/换绑"并留意冷却时间
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs shrink-0 mt-0.5">
                4
              </div>
              <div>
                <span className="font-medium text-foreground">检查邮箱</span>：操作成功后请查收 ChatGPT 团队邀请邮件
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

