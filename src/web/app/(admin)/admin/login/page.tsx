'use client'

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AdminLoginPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/admin/overview")
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-muted-foreground">正在跳转至控制台…</p>
    </div>
  )
}
