import { type NextRequest, NextResponse } from "next/server"

// 检查Admin认证状态
export async function GET(request: NextRequest) {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const url = `${backendUrl}/api/admin/me`

    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.delete('connection')
    headers.set('X-Request-Source', 'nextjs-frontend')

    const response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'manual',
    })

    const data = await response.json()

    return NextResponse.json(data, {
      status: response.status,
    })
  } catch (error) {
    console.error('Admin auth check error:', error)
    return NextResponse.json(
      { authenticated: false, message: 'Service unavailable' },
      { status: 503 }
    )
  }
}