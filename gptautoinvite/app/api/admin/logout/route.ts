import { NextResponse } from "next/server"

// Forward logout to FastAPI backend to revoke server-side session
export async function POST() {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const resp = await fetch(`${backendUrl}/api/admin/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    const data = await resp.json().catch(() => ({ ok: false }))
    const out = NextResponse.json(data, { status: resp.status })
    const setCookie = resp.headers.get("set-cookie")
    if (setCookie) {
      out.headers.set("Set-Cookie", setCookie)
    }
    return out
  } catch (error) {
    console.error("Admin logout error:", error)
    return NextResponse.json(
      { success: false, message: "退出登录失败" },
      { status: 500 },
    )
  }
}

