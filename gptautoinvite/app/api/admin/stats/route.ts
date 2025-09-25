import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

// 检查管理员认证的中间件函数
function checkAdminAuth() {
  const cookieStore = cookies()
  const adminSession = cookieStore.get("admin_session")
  return !!adminSession?.value
}

export async function GET(request: NextRequest) {
  try {
    // 检查认证
    if (!checkAdminAuth()) {
      return NextResponse.json(
        {
          success: false,
          message: "未授权访问",
        },
        { status: 401 },
      )
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"

    console.log("[v0] Attempting to fetch stats from backend:", `${backendUrl}/api/admin/stats`)
    const response = await fetch(`${backendUrl}/api/admin/stats`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Source": "nextjs-frontend",
      },
      signal: AbortSignal.timeout(10000), // increased timeout to 10 seconds
    })

    if (response.ok) {
      const data = await response.json()
      console.log("[v0] Successfully fetched stats from backend")
      return NextResponse.json(data)
    } else {
      console.log("[v0] Backend stats responded with error:", response.status)
      return NextResponse.json(
        {
          success: false,
          message: `后端服务错误: ${response.status}`,
        },
        { status: 502 },
      )
    }
  } catch (error) {
    console.error("Admin stats error:", error)
    return NextResponse.json(
      {
        success: false,
        message: "后端服务不可用，请检查服务状态",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 },
    )
  }
}
