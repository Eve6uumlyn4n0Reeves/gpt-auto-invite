import { type NextRequest, NextResponse } from "next/server"

// Admin API代理路由 - 将前端请求转发到后端
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxyRequest(request, await params)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxyRequest(request, await params)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxyRequest(request, await params)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxyRequest(request, await params)
}

async function handleProxyRequest(
  request: NextRequest,
  params: { path: string[] }
) {
  try {
    // 构建后端URL
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const path = params.path.join("/")
    const search = request.nextUrl.search || ""
    const url = `${backendUrl}/api/admin/${path}${search}`

    // 获取请求头
    const headers = new Headers(request.headers)

    // 移除可能导致问题的头信息
    headers.delete("host")
    headers.delete("connection")
    headers.delete("content-length")

    // 添加标识头
    headers.set("X-Request-Source", "nextjs-frontend")

    // 克隆请求体
    let body: BodyInit | null = null
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const arrayBuffer = await request.arrayBuffer()
      if (arrayBuffer.byteLength > 0) {
        body = arrayBuffer
      } else {
        body = null
      }
    }

    // 转发请求到后端
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    })

    // 克隆响应头
    const responseHeaders = new Headers(response.headers)

    // 移除可能导致问题的响应头
    responseHeaders.delete("connection")
    responseHeaders.delete("transfer-encoding")

    // 获取响应体
    const responseBuffer = await response.arrayBuffer()

    // 返回代理响应
    const nextResponse = new NextResponse(responseBuffer, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })

    const setCookie = response.headers.get("set-cookie")
    if (setCookie) {
      nextResponse.headers.set("set-cookie", setCookie)
    }

    return nextResponse
  } catch (error) {
    console.error("Admin API proxy error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Admin API proxy error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    )
  }
}
