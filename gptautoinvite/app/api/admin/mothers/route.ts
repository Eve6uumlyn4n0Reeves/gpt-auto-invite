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

    // 调用FastAPI后端获取母账号数据
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"

    console.log("[v0] Attempting to fetch from backend:", `${backendUrl}/api/admin/mothers`)
    const response = await fetch(`${backendUrl}/api/admin/mothers`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
      },
      signal: AbortSignal.timeout(10000), // increased timeout to 10 seconds
    })

    if (response.ok) {
      const data = await response.json()
      console.log("[v0] Successfully fetched from backend")
      return NextResponse.json(data)
    } else {
      console.log("[v0] Backend responded with error:", response.status)
      return NextResponse.json(
        {
          success: false,
          message: `后端服务错误: ${response.status}`,
        },
        { status: 502 },
      )
    }
  } catch (error) {
    console.error("Admin mothers error:", error)
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

export async function PUT(request: NextRequest) {
  try {
    if (!checkAdminAuth()) {
      return NextResponse.json({ success: false, message: "未授权访问" }, { status: 401 })
    }

    const body = await request.json()
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"

    const response = await fetch(`${backendUrl}/api/admin/mothers`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json(data)
    } else {
      return NextResponse.json({ success: false, message: `后端服务错误: ${response.status}` }, { status: 502 })
    }
  } catch (error) {
    console.error("Update mother error:", error)
    return NextResponse.json({ success: false, message: "后端服务不可用" }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!checkAdminAuth()) {
      return NextResponse.json({ success: false, message: "未授权访问" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const motherId = searchParams.get("id")

    if (!motherId) {
      return NextResponse.json({ success: false, message: "缺少母账号ID" }, { status: 400 })
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"

    const response = await fetch(`${backendUrl}/api/admin/mothers/${motherId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
      },
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json(data)
    } else {
      return NextResponse.json({ success: false, message: `后端服务错误: ${response.status}` }, { status: 502 })
    }
  } catch (error) {
    console.error("Delete mother error:", error)
    return NextResponse.json({ success: false, message: "后端服务不可用" }, { status: 503 })
  }
}
