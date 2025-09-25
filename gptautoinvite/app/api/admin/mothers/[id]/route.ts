import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

function checkAdminAuth() {
  const cookieStore = cookies()
  const adminSession = cookieStore.get("admin_session")
  return !!adminSession?.value
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkAdminAuth()) {
      return NextResponse.json({ success: false, message: "未授权访问" }, { status: 401 })
    }

    const motherId = params.id
    const body = await request.json()

    console.log("[v0] Mock updating mother:", motherId, body)

    return NextResponse.json({
      success: true,
      message: "母账号更新成功",
      data: { id: motherId, ...body },
    })
  } catch (error) {
    console.error("Update mother error:", error)
    return NextResponse.json({ success: false, message: "更新母账号失败" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkAdminAuth()) {
      return NextResponse.json({ success: false, message: "未授权访问" }, { status: 401 })
    }

    const motherId = params.id
    console.log("[v0] Mock deleting mother:", motherId)

    return NextResponse.json({
      success: true,
      message: "母账号删除成功",
    })
  } catch (error) {
    console.error("Delete mother error:", error)
    return NextResponse.json({ success: false, message: "删除母账号失败" }, { status: 500 })
  }
}
