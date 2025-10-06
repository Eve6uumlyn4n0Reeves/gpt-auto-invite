import { type NextRequest, NextResponse } from "next/server"
import { validateRequest, redeemSchema } from "@/lib/validation"
import { sanitizeInput } from "@/lib/auth"
import { redeemRateLimit } from "@/lib/rate-limit"
import { withPerformanceMonitoring, withTimeout, withRetry, withDeduplication } from "@/lib/performance"

export async function POST(request: NextRequest) {
  return redeemRateLimit.middleware(request, async () => {
    return withPerformanceMonitoring(async () => {
      try {
        const body = await request.json()

        const validation = validateRequest(redeemSchema, body)
        if (!validation.success) {
          return NextResponse.json(
            {
              success: false,
              message: validation.error,
            },
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

        const data = await response.json()

        if (response.ok) {
          return NextResponse.json({
            success: true,
            message: data.message || "Redemption successful! Invitation email has been sent to your inbox",
            invite_request_id: data.invite_request_id,
            mother_id: data.mother_id,
            team_id: data.team_id,
          })
        } else {
          return NextResponse.json(
            {
              success: false,
              message: data.message || "Redemption failed, please check if the redemption code is correct",
            },
            { status: response.status },
          )
        }
      } catch (error) {
        console.error("Redeem API error:", error)
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
