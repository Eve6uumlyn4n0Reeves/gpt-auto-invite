import type { ReactNode } from "react"
import { NotificationProvider } from "@/components/notification-system"
import { ToastProvider } from "@/components/toast-provider"
import { PerformanceMonitor } from "@/components/performance-monitor"
import { AdminHeader } from "@/components/admin/admin-header"
import { ErrorBoundary } from "@/components/error-boundary"

export const dynamic = "force-dynamic"

export default async function AdminProtectedLayout({ children }: { children: ReactNode }) {
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
