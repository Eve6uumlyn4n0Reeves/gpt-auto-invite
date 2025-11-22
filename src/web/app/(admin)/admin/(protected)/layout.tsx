'use client'

import type { ReactNode } from "react"
import { useState } from "react"
import { NotificationProvider } from "@/components/notification-system"
import { ToastProvider } from "@/components/toast-provider"
import { PerformanceMonitor } from "@/components/performance-monitor"
import { ErrorBoundary } from "@/components/error-boundary"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/admin/app-sidebar"
import { NavigationBreadcrumb } from "@/components/admin/navigation-breadcrumb"
import { QuickActions } from "@/components/admin/quick-actions"
import { GlobalSearch } from "@/components/admin/global-search"

export const dynamic = "force-dynamic"

export default function AdminProtectedLayout({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <NotificationProvider>
      <ToastProvider>
        <SidebarProvider defaultOpen={true}>
          <div className="min-h-screen flex w-full bg-background text-foreground">
            <AppSidebar />
            <SidebarInset className="flex flex-col">
              {/* 顶部工具栏 */}
              <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
                <div className="flex items-center gap-2 flex-1">
                  <NavigationBreadcrumb />
                </div>
                <QuickActions onSearchClick={() => setSearchOpen(true)} />
              </header>

              {/* 主内容区 */}
              <ErrorBoundary>
                <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">{children}</main>
              </ErrorBoundary>
            </SidebarInset>
          </div>
          <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
          <PerformanceMonitor />
        </SidebarProvider>
      </ToastProvider>
    </NotificationProvider>
  )
}
