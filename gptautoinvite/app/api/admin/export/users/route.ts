import { type NextRequest, NextResponse } from "next/server"
import { checkAdminAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format") || "csv"

    // Call FastAPI backend for user data export
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const response = await fetch(`${backendUrl}/api/admin/export/users?format=${format}`, {
      method: "GET",
      headers: {
        "X-Request-Source": "nextjs-frontend",
        ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
      },
    })

    if (response.ok) {
      const blob = await response.blob()
      const contentType = format === "csv" ? "text/csv" : "application/json"

      return new NextResponse(blob, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="users-export-${new Date().toISOString().split("T")[0]}.${format}"`,
        },
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "Export failed",
        },
        { status: response.status },
      )
    }
  } catch (error) {
    console.error("Export users error:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Server error, please try again later",
      },
      { status: 500 },
    )
  }
}
