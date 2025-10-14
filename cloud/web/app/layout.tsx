import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "GPT Team Auto Invite Service",
  description: "Enterprise AI Team Invitation Service - Automated ChatGPT Team Seat Management",
  keywords: ["GPT", "ChatGPT", "Team", "AI", "Enterprise Service", "Auto Invite"],
  authors: [{ name: "GPT Team Invite Service" }],
  themeColor: "#6366f1",
  viewport: {
    width: "device-width",
    initialScale: 1,
  },
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: "/favicon.ico",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
