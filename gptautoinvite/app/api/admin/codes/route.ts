import { type NextRequest, NextResponse } from "next/server"
import { checkAdminAuth } from "@/lib/auth"
import { validateRequest, generateCodesSchema } from "@/lib/validation"
import { adminRateLimit } from "@/lib/rate-limit"
import { withPerformanceMonitoring, withTimeout, withRetry } from "@/lib/performance"

export async function POST(request: NextRequest) {
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

        const body = await request.json()

        const validation = validateRequest(generateCodesSchema, body)
        if (!validation.success) {
          return NextResponse.json(
            {
              success: false,
              message: validation.error,
            },
            { status: 400 },
          )
        }

        const { count, prefix } = validation.data

        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
        const cookieHeader = request.headers.get("cookie") || undefined
        const response = await withTimeout(
          withRetry(
            async () => {
              return fetch(`${backendUrl}/api/admin/codes`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Request-Source": "nextjs-frontend",
                  ...(cookieHeader ? { cookie: cookieHeader } : {}),
                },
                body: JSON.stringify({ count, prefix }),
              })
            },
            2,
            1000,
          ),
          30000, // 30秒超时，因为生成大量代码可能需要更长时间
        )

        if (response.ok) {
          const data = await response.json()
          return NextResponse.json(data)
        } else {
          const errorData = await response.json()
          return NextResponse.json(
            {
              success: false,
              message: errorData.message || "生成兑换码失败",
            },
            { status: response.status },
          )
        }
      } catch (error) {
        console.error("Generate codes error:", error)
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

export async function GET(request: NextRequest) {
  return adminRateLimit.middleware(request, async () => {
    return withPerformanceMonitoring(async () => {
      try {
        const authResult = await checkAdminAuth()
        if (!authResult.authenticated) {
          return NextResponse.json(
            { success: false, message: "未授权访问" },
            { status: 401 },
          )
        }

        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
        const cookieHeader = request.headers.get("cookie") || undefined
        const resp = await withTimeout(
          withRetry(
            async () =>
              fetch(`${backendUrl}/api/admin/codes`, {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  ...(cookieHeader ? { cookie: cookieHeader } : {}),
                },
              }),
            2,
            1000,
          ),
          15000,
        )

        if (!resp.ok) {
          const errorData = await resp.json().catch(() => ({}))
          return NextResponse.json(
            { success: false, message: errorData.message || "加载兑换码失败" },
            { status: resp.status },
          )
        }
        const data = await resp.json()
        return NextResponse.json(data)
      } catch (error) {
        console.error("Codes GET error:", error)
        return NextResponse.json({ success: false, message: "服务器错误" }, { status: 500 })
      }
    })
  })
}
