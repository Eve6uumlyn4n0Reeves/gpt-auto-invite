import { type NextRequest, NextResponse } from "next/server"
import { validateRequest, adminLoginSchema } from "@/lib/validation"
import { loginRateLimit } from "@/lib/rate-limit"
import { withPerformanceMonitoring } from "@/lib/performance"

// Forward login to FastAPI backend to issue signed session cookie
export async function POST(request: NextRequest) {
  return loginRateLimit.middleware(request, async () => {
    return withPerformanceMonitoring(async () => {
      try {
        const body = await request.json()

        const validation = validateRequest(adminLoginSchema, body)
        if (!validation.success) {
          return NextResponse.json(
            { success: false, message: validation.error },
            { status: 400 },
          )
        }

        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
        const resp = await fetch(`${backendUrl}/api/admin/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: validation.data.password }),
        })

        const data = await resp.json().catch(() => ({ ok: false }))

        // Build response and propagate Set-Cookie from backend
        const out = NextResponse.json(
          data,
          { status: resp.status },
        )
        const setCookie = resp.headers.get("set-cookie")
        if (setCookie) {
          out.headers.set("Set-Cookie", setCookie)
        }
        return out
      } catch (error) {
        console.error("Admin login error:", error)
        return NextResponse.json(
          { success: false, message: "Server error, please try again later" },
          { status: 500 },
        )
      }
    })
  })
}
