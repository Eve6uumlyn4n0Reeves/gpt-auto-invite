import { type NextRequest, NextResponse } from "next/server"

// Admin登录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const url = `${backendUrl}/api/admin/login`

    const headers = new Headers(request.headers)
    headers.delete("host")
    headers.delete("connection")
    headers.set("X-Request-Source", "nextjs-frontend")

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
    })

    const responseHeaders = new Headers(response.headers)
    responseHeaders.delete("connection")
    responseHeaders.delete("transfer-encoding")

    const responseBody = await response.text()
    const nextResponse = new NextResponse(responseBody, {
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
    console.error("Admin login error:", error)
    return NextResponse.json(
      { message: "Login service unavailable" },
      { status: 503 },
    )
  }
}
