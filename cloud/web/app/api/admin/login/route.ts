import { type NextRequest, NextResponse } from "next/server"

// Admin登录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const url = `${backendUrl}/api/admin/login`

    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.delete('connection')
    headers.set('X-Request-Source', 'nextjs-frontend')

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'manual',
    })

    const data = await response.json()

    return NextResponse.json(data, {
      status: response.status,
    })
  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json(
      { message: 'Login service unavailable' },
      { status: 503 }
    )
  }
}