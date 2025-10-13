import { type NextRequest, NextResponse } from "next/server"

// Admin登出
export async function POST(request: NextRequest) {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const url = `${backendUrl}/api/admin/logout`

    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.delete('connection')
    headers.set('X-Request-Source', 'nextjs-frontend')

    const response = await fetch(url, {
      method: 'POST',
      headers,
      redirect: 'manual',
    })

    const data = await response.json()

    return NextResponse.json(data, {
      status: response.status,
    })
  } catch (error) {
    console.error('Admin logout error:', error)
    return NextResponse.json(
      { message: 'Logout service unavailable' },
      { status: 503 }
    )
  }
}