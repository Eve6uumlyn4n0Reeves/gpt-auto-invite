import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { RefreshCw } from "lucide-react"
import type { MotherAccount } from "@/store/admin-context"

interface MothersSectionProps {
  mothers: MotherAccount[]
  loading: boolean
  onCreateMother: () => void
  onRefresh: () => void
  onEditMother: (mother: MotherAccount) => void
  onCopyMotherName: (mother: MotherAccount) => void
  onDeleteMother: (motherId: number) => void
}

export function MothersSection({
  mothers,
  loading,
  onCreateMother,
  onRefresh,
  onEditMother,
  onCopyMotherName,
  onDeleteMother,
}: MothersSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">母号看板</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={onCreateMother}>
            新增母号
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> 刷新
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mothers.map((mother) => {
          const used = mother.seats_used
          const total = mother.seat_limit
          const percentage = total > 0 ? Math.round((used / total) * 100) : 0

          return (
            <Card key={mother.id} className="border-border/40 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="truncate" title={mother.name}>
                    {mother.name}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      mother.status === "active"
                        ? "bg-green-500/20 text-green-600 border-green-500/30"
                        : "bg-yellow-500/20 text-yellow-700 border-yellow-500/30"
                    }`}
                  >
                    {mother.status === "active" ? "活跃" : mother.status}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs">
                  座位：{used}/{total} （{percentage}%）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${percentage}%` }} />
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  团队：
                  {mother.teams.filter((team) => team.is_enabled).map((team) => team.team_name || team.team_id).join("，") ||
                    "无"}
                </div>
              </CardContent>
              <CardFooter className="pt-4 flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEditMother(mother)}>
                    编辑
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onCopyMotherName(mother)}>
                    复制名称
                  </Button>
                </div>
                <Button variant="destructive" size="sm" onClick={() => onDeleteMother(mother.id)}>
                  删除
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

