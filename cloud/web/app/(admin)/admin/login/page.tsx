'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password.trim()) {
      setError("请输入管理员密码")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || "密码错误")
      }

      router.replace("/admin")
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "登录失败，请稍后重试"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md border-border/40 bg-card/80 backdrop-blur">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            🔒
          </div>
          <CardTitle className="text-xl font-semibold">管理员登录</CardTitle>
          <CardDescription className="text-muted-foreground">
            输入后台管理员密码以访问管理控制台
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password">管理员密码</Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="请输入管理员密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                required
                className="bg-background/60"
              />
            </div>

            {error && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertDescription className="text-red-600">{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中..." : "登录后台"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
