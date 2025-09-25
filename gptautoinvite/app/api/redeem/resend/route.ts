import { type NextRequest, NextResponse } from "next/server"
import { validateRequest, resendSchema } from "@/lib/validation"
import { sanitizeInput } from "@/lib/auth"

export async function POST(request: NextRequest) {
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

    // 调用FastAPI后端
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const response = await fetch(`${backendUrl}/api/redeem/resend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Source": "nextjs-frontend",
      },
      body: JSON.stringify({ email: cleanEmail, team_id: cleanTeamId }),
    })

    const data = await response.json()

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: data.message || "邀请邮件已重新发送",
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          message: data.message || "重发失败，请稍后重试",
        },
        { status: response.status },
      )
    }
  } catch (error) {
    console.error("Resend API error:", error)
    return NextResponse.json(
      {
        success: false,
        message: "服务器错误，请稍后重试",
      },
      { status: 500 },
    )
  }
}
