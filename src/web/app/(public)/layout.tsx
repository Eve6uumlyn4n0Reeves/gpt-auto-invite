import type { ReactNode } from "react"

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tight bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent">
            GPT Team 邀请服务
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            使用兑换码快速激活企业团队席位
          </p>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
