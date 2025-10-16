'use client'

import type { ReactNode } from "react"
import { AdminProvider } from "@/store/admin-context"

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminProvider>
      <div className="min-h-screen bg-background text-foreground">{children}</div>
    </AdminProvider>
  )
}
