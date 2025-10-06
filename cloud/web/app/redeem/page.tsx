import RedeemForm from "@/components/redeem-form"

export default function RedeemPage() {
  return (
    <div className="min-h-screen bg-background grid-bg">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm bg-card/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-brand-secondary rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-primary-foreground font-bold text-lg">AI</span>
              </div>
              <div>
                <span className="text-xl font-semibold bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent">
                  GPT 团队邀请
                </span>
                <div className="text-xs text-muted-foreground">企业级 AI 团队邀请服务</div>
              </div>
            </div>
            <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-background/50 border border-border/40">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-muted-foreground">服务正常</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-balance leading-tight">
              兑换您的
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-brand-secondary to-primary animate-shimmer bg-[length:200%_100%]">
                {" "}
                GPT 团队{" "}
              </span>
              席位
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed mb-4">
              输入您的兑换码和邮箱地址，获取 ChatGPT Team 访问权限
            </p>
            <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-1">
                <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                <span>自动分配</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                <span>即时邀请</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-1 h-1 bg-purple-500 rounded-full"></div>
                <span>安全可靠</span>
              </div>
            </div>
          </div>

          <RedeemForm />

          <div className="mt-12 space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="group p-6 rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/10">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                    <span className="text-primary text-sm">⚡</span>
                  </div>
                  <div className="text-sm font-medium">智能分配</div>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  系统自动选择最优母账号，确保最佳的席位分配和团队体验
                </div>
              </div>

              <div className="group p-6 rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-brand-secondary/10">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 bg-brand-secondary/20 rounded-lg flex items-center justify-center group-hover:bg-brand-secondary/30 transition-colors">
                    <span className="text-brand-secondary text-sm">📧</span>
                  </div>
                  <div className="text-sm font-medium">即时邀请</div>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  兑换成功后立即向您的邮箱发送团队邀请，快速获得访问权限
                </div>
              </div>
            </div>

            <div className="text-center p-4 rounded-lg border border-border/40 bg-card/30 backdrop-blur-sm">
              <div className="text-xs text-muted-foreground">
                🔒 您的信息受到企业级安全保护，我们承诺不会泄露任何个人数据
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 bg-card/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 GPT 团队邀请服务 · 企业级 AI 团队管理解决方案</p>
          <div className="mt-2 flex items-center justify-center space-x-4 text-xs">
            <span>🛡️ 安全可靠</span>
            <span>⚡ 快速响应</span>
            <span>🎯 精准分配</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
