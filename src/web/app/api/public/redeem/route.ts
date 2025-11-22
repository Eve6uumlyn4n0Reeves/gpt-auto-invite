import { type NextRequest } from "next/server"
import { handleRedeem } from "@/domains/redeem/handler"

export async function POST(request: NextRequest) {
  return handleRedeem(request, {
    successMessage: "Redemption successful!",
    failureMessage: "Redemption failed",
    defaultSuccess: true,
  })
}
