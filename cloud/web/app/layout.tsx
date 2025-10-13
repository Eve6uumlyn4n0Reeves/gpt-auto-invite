import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ToastProvider } from "@/components/toast-provider"
import { NotificationProvider } from "@/components/notification-system"
import { PerformanceMonitor } from "@/components/performance-monitor"

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
  viewport: "width=device-width, initial-scale=1",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className={`${inter.variable} dark`}>
      <head>
        <meta name="theme-color" content="#6366f1" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NotificationProvider>
          <ToastProvider>
            {children}
            <PerformanceMonitor />
          </ToastProvider>
        </NotificationProvider>
      </body>
    </html>
  )
}
