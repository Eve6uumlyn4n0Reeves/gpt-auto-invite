import RedeemForm from "@/components/redeem-form"

export default function RedeemPage() {
  return (
    <div className="min-h-screen bg-background grid-bg">
      {/* Header */}
      <header className="border-b border-border/40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">AI</span>
              </div>
              <span className="text-xl font-semibold">GPT 团队邀请</span>
            </div>
            <div className="text-sm text-muted-foreground">企业级 AI 团队邀请服务</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl font-bold mb-4 text-balance">
              兑换您的
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-brand-secondary">
                {" "}
                GPT 团队{" "}
              </span>
              席位
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">输入您的兑换码和邮箱地址，获取 ChatGPT Team 访问权限</p>
          </div>

          <RedeemForm />

          {/* Features */}
          <div className="mt-12 grid grid-cols-1 gap-4 text-center animate-fade-in">
            <div className="p-4 rounded-lg border border-border/40 bg-card/50">
              <div className="text-sm font-medium mb-1">自动邀请</div>
              <div className="text-xs text-muted-foreground">系统将自动向您的邮箱发送团队邀请</div>
            </div>
            <div className="p-4 rounded-lg border border-border/40 bg-card/50">
              <div className="text-sm font-medium mb-1">即时访问</div>
              <div className="text-xs text-muted-foreground">兑换成功后立即获得访问权限</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 GPT 团队邀请服务 企业级 AI 团队管理解决方案</p>
        </div>
      </footer>
    </div>
  )
}

