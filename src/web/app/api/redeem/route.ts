import { type NextRequest } from "next/server"
import { handleRedeem } from "@/domains/redeem/handler"

export async function POST(request: NextRequest) {
  return handleRedeem(request, {
    successMessage: "Redemption successful! Invitation email has been sent to your inbox",
    failureMessage: "Redemption failed, please check if the redemption code is correct",
    defaultSuccess: true,
  })
}
