import { type NextRequest, NextResponse } from "next/server"
import { validateRequest, resendSchema } from "@/lib/validation"
import { sanitizeInput } from "@/lib/auth"
import { redeemRateLimit } from "@/lib/rate-limit"
import { withPerformanceMonitoring, withTimeout, withRetry, withDeduplication } from "@/lib/performance"

export async function POST(request: NextRequest) {
  return redeemRateLimit.middleware(request, async () => {
    return withPerformanceMonitoring(async () => {
      try {
        const body = await request.json()

        const validation = validateRequest(resendSchema, body)
        if (!validation.success) {
          return NextResponse.json(
            {
              success: false,
              message: validation.error,
            },
            { status: 400 },
          )
        }

        const { email, team_id } = validation.data

        const cleanEmail = sanitizeInput(email)
        const cleanTeamId = sanitizeInput(team_id)

        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
        const response = await withTimeout(
          withRetry(
            async () =>
              withDeduplication(
                `resend:${cleanEmail}:${cleanTeamId}`,
                () =>
                  fetch(`${backendUrl}/api/redeem/resend`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Request-Source": "nextjs-frontend",
                    },
                    body: JSON.stringify({ email: cleanEmail, team_id: cleanTeamId }),
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
            success: data.success ?? true,
            message: data.message || "Resent successfully",
          })
        } else {
          return NextResponse.json(
            {
              success: false,
              message: data.message || "Resend failed, please try again later",
            },
            { status: response.status },
          )
        }
      } catch (error) {
        console.error("Resend API error:", error)
        return NextResponse.json(
          {
            success: false,
            message: "Server error, please try again later",
          },
          { status: 500 },
        )
      }
    })
  })
}

