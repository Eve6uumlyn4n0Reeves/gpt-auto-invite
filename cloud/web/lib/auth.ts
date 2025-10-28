export interface AuthResult {
  authenticated: boolean
  user?: string
}

export async function checkAdminAuth(_sessionToken?: string): Promise<AuthResult> {
  return { authenticated: true, user: "dev" }
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
