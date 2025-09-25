import { type NextRequest, NextResponse } from "next/server"
import { checkAdminAuth } from "@/lib/auth"
import { adminRateLimit } from "@/lib/rate-limit"
import { withPerformanceMonitoring, withTimeout, withRetry } from "@/lib/performance"

export async function GET(request: NextRequest) {
  return adminRateLimit.middleware(request, async () => {
    return withPerformanceMonitoring(async () => {
      try {
        const authResult = await checkAdminAuth()
        if (!authResult.authenticated) {
          return NextResponse.json(
            {
              success: false,
              message: "未授权访问",
            },
            { status: 401 },
          )
        }

        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
        const cookieHeader = request.headers.get("cookie") || undefined
        const response = await withTimeout(
          withRetry(
            async () => {
              return fetch(`${backendUrl}/api/admin/users`, {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  "X-Request-Source": "nextjs-frontend",
                  ...(cookieHeader ? { cookie: cookieHeader } : {}),
                },
              })
            },
            2,
            1000,
          ),
          15000,
        )

        if (response.ok) {
          const data = await response.json()
          return NextResponse.json(data)
        } else {
          return NextResponse.json(
            {
              success: false,
              message: "获取用户数据失败",
            },
            { status: response.status },
          )
        }
      } catch (error) {
        console.error("Admin users error:", error)
        return NextResponse.json(
          {
            success: false,
            message: "服务器错误，请稍后重试",
          },
          { status: 500 },
        )
      }
    })
  })
}
