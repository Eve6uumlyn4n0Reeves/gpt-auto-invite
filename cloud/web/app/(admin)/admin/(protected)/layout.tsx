import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { NotificationProvider } from "@/components/notification-system"
import { ToastProvider } from "@/components/toast-provider"
import { PerformanceMonitor } from "@/components/performance-monitor"
import { AdminHeader } from "@/components/admin/admin-header"
import { ErrorBoundary } from "@/components/error-boundary"
import { checkAdminAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function AdminProtectedLayout({ children }: { children: ReactNode }) {
  const cookieStore = cookies()
  const sessionCookie = cookieStore.get("admin_session")
  if (!sessionCookie) {
    redirect("/admin/login")
  }

  const auth = await checkAdminAuth(sessionCookie.value)
  if (!auth.authenticated) {
    redirect("/admin/login?reason=expired")
  }

  return (
    <NotificationProvider>
      <ToastProvider>
        <div className="min-h-screen bg-background text-foreground">
          <AdminHeader />
          <ErrorBoundary>
            <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
          </ErrorBoundary>
        </div>
        <PerformanceMonitor />
      </ToastProvider>
    </NotificationProvider>
  )
}
