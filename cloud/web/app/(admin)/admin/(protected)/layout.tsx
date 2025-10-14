import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { NotificationProvider } from "@/components/notification-system"
import { ToastProvider } from "@/components/toast-provider"
import { StickyHeader } from "@/components/sticky-header"
import { PerformanceMonitor } from "@/components/performance-monitor"

export const dynamic = "force-dynamic"

export default function AdminProtectedLayout({ children }: { children: ReactNode }) {
  const hasAdminSession = cookies().has("admin_session")
  if (!hasAdminSession) {
    redirect("/admin/login")
  }

  return (
    <NotificationProvider>
      <ToastProvider>
        <div className="min-h-screen bg-background text-foreground">
          <StickyHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </div>
        <PerformanceMonitor />
      </ToastProvider>
    </NotificationProvider>
  )
}
