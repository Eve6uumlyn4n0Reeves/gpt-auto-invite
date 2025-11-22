import { NextResponse, type NextRequest } from "next/server"
import { validateRequest, redeemSchema } from "@/lib/validation"
import { sanitizeInput } from "@/lib/auth"
import { redeemRateLimit } from "@/lib/rate-limit"
import { withPerformanceMonitoring, withTimeout, withRetry, withDeduplication } from "@/lib/performance"

interface RedeemHandlerOptions {
  successMessage?: string
  failureMessage?: string
  defaultSuccess?: boolean
}

export async function handleRedeem(request: NextRequest, opts: RedeemHandlerOptions = {}) {
  const { successMessage, failureMessage, defaultSuccess } = opts

  return redeemRateLimit.middleware(request, async () => {
    return withPerformanceMonitoring(async () => {
      try {
        const body = await request.json()

        const validation = validateRequest(redeemSchema, body)
        if (!validation.success) {
          return NextResponse.json(
            { success: false, message: validation.error },
            { status: 400 },
          )
        }

        const { code, email } = validation.data
        const cleanCode = sanitizeInput(code)
        const cleanEmail = sanitizeInput(email)

        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"

        const response = await withTimeout(
          withRetry(
            async () =>
              withDeduplication(
                `redeem:${cleanCode}:${cleanEmail}`,
                () =>
                  fetch(`${backendUrl}/api/redeem`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Request-Source": "nextjs-frontend",
                    },
                    body: JSON.stringify({ code: cleanCode, email: cleanEmail }),
                  }),
              ),
            2,
            1000,
          ),
          15000,
        )

        const data = await response.json().catch(() => ({}))

        if (response.ok) {
          return NextResponse.json({
            success: data.success ?? defaultSuccess ?? true,
            message: data.message || successMessage || "Redemption successful!",
            invite_request_id: data.invite_request_id,
            mother_id: data.mother_id,
            team_id: data.team_id,
          })
        } else {
          return NextResponse.json(
            {
              success: false,
              message: data.message || failureMessage || "Redemption failed",
            },
            { status: response.status },
          )
        }
      } catch (error) {
        console.error("Redeem API error:", error)
        return NextResponse.json(
          { success: false, message: "Server error, please try again later" },
          { status: 500 },
        )
      }
    })
  })
}

