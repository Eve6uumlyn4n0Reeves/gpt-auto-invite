import { type NextRequest, NextResponse } from "next/server"

// Admin登出
export async function POST(request: NextRequest) {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const url = `${backendUrl}/api/admin/logout`

    const headers = new Headers(request.headers)
    headers.delete("host")
    headers.delete("connection")
    headers.set("X-Request-Source", "nextjs-frontend")

    const response = await fetch(url, {
      method: "POST",
      headers,
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
    console.error("Admin logout error:", error)
    return NextResponse.json(
      { message: "Logout service unavailable" },
      { status: 503 },
    )
  }
}
