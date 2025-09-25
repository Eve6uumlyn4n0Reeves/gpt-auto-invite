import { type NextRequest, NextResponse } from "next/server"
import { checkAdminAuth } from "@/lib/auth"
import { validateRequest, batchOperationSchema } from "@/lib/validation"

export async function POST(request: NextRequest) {
  try {
    const authResult = await checkAdminAuth()
    if (!authResult.authenticated) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized access",
        },
        { status: 401 },
      )
    }

    const body = await request.json()

    const validation = validateRequest(batchOperationSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error,
        },
        { status: 400 },
      )
    }

    const { action, ids, confirm } = validation.data

    if (!confirm) {
      return NextResponse.json(
        {
          success: false,
          message: "Operation not confirmed",
        },
        { status: 400 },
      )
    }

    // Call FastAPI backend for batch code operations
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const response = await fetch(`${backendUrl}/api/admin/batch/codes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Source": "nextjs-frontend",
      },
      body: JSON.stringify({ action, ids, confirm }),
    })

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json(data)
    } else {
      const errorData = await response.json()
      return NextResponse.json(
        {
          success: false,
          message: errorData.message || "Batch operation failed",
        },
        { status: response.status },
      )
    }
  } catch (error) {
    console.error("Batch codes operation error:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Server error, please try again later",
      },
      { status: 500 },
    )
  }
}
