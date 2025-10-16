import { cookies } from "next/headers"

export interface AuthResult {
  authenticated: boolean
  user?: string
}

export async function checkAdminAuth(sessionToken?: string): Promise<AuthResult> {
  try {
    const token =
      sessionToken ??
      (() => {
        const cookieStore = cookies()
        return cookieStore.get("admin_session")?.value
      })()

    if (!token) {
      return { authenticated: false }
    }

    // Verify with backend so server-side session is honored
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
    const resp = await fetch(`${backendUrl}/api/admin/me`, {
      method: "GET",
      headers: {
        // forward only admin_session cookie
        cookie: `admin_session=${token}`,
      },
      cache: "no-store",
    })
    if (!resp.ok) return { authenticated: false }
    const data = (await resp.json()) as { authenticated?: boolean }
    return { authenticated: !!data?.authenticated, user: data?.authenticated ? "admin" : undefined }
  } catch (error) {
    console.error("Auth check error:", error)
    return { authenticated: false }
  }
}

export function sanitizeInput(input: string): string {
  if (!input || typeof input !== "string") {
    return ""
  }

  // Remove potentially dangerous characters and trim whitespace
  return input
    .trim()
    .replace(/[<>"'&]/g, "") // Remove HTML/script injection characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .substring(0, 1000) // Limit length to prevent DoS
}
