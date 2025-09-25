import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const adminSession = cookieStore.get("admin_session")
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"

    const resp = await fetch(`${backendUrl}/api/admin/me`, {
      method: "GET",
      headers: adminSession?.value ? { cookie: `admin_session=${adminSession.value}` } : undefined,
    })

    if (!resp.ok) return NextResponse.json({ authenticated: false })
    const data = await resp.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Admin me error:", error)
    return NextResponse.json({ authenticated: false })
  }
}
