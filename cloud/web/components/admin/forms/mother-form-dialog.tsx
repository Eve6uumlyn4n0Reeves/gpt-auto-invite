import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TeamFormInput } from "@/types/admin"

export interface MotherFormState {
  name: string
  access_token: string
  token_expires_at: string
  notes: string
  teams: TeamFormInput[]
}

export interface MotherFormDialogProps {
  mode: "create" | "edit"
  open: boolean
  onOpenChange: (open: boolean) => void
  form: MotherFormState
  onFormChange: (updater: (prev: MotherFormState) => MotherFormState) => void
  onSubmit: (form: MotherFormState) => Promise<void>
  loading: boolean
  error?: string | null
}

export const getEmptyMotherFormState = (): MotherFormState => ({
  name: "",
  access_token: "",
  token_expires_at: "",
  notes: "",
  teams: [
    {
      team_id: "",
      team_name: "",
      is_enabled: true,
      is_default: true,
    },
  ],
})

export function MotherFormDialog({
  mode,
  open,
  onOpenChange,
  form,
  onFormChange,
  onSubmit,
  loading,
  error,
}: MotherFormDialogProps) {
  const title = mode === "create" ? "新增母号" : "编辑母号"

  const updateField = (field: keyof MotherFormState, value: string) => {
    onFormChange((prev) => ({ ...prev, [field]: value }))
  }

  const updateTeam = (index: number, field: keyof TeamFormInput, value: string | boolean) => {
    onFormChange((prev) => {
      const teams = prev.teams.map((team, idx) => (idx === index ? { ...team, [field]: value } : team))
      return { ...prev, teams }
    })
  }

  const addTeam = () => {
    onFormChange((prev) => ({
      ...prev,
      teams: [
        ...prev.teams,
        {
          team_id: "",
          team_name: "",
          is_enabled: true,
          is_default: prev.teams.length === 0,
        },
      ],
    }))
  }

  const removeTeam = (index: number) => {
    onFormChange((prev) => {
      if (prev.teams.length <= 1) return prev
      const teams = prev.teams.filter((_, idx) => idx !== index)
      if (!teams.some((team) => team.is_default) && teams.length > 0) {
        teams[0].is_default = true
      }
      return { ...prev, teams }
    })
  }

  const setDefaultTeam = (index: number) => {
    onFormChange((prev) => ({
      ...prev,
      teams: prev.teams.map((team, idx) => ({
        ...team,
        is_default: idx === index,
      })),
    }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await onSubmit(form)
    } catch {
      // 错误已在外部处理
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" showCloseButton>
        <form onSubmit={handleSubmit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="mother-name">母号名称 *</Label>
              <Input
                id="mother-name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="邮箱或账号"
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="mother-token">访问令牌 *</Label>
              <Input
                id="mother-token"
                value={form.access_token}
                onChange={(event) => updateField("access_token", event.target.value)}
                placeholder="输入访问令牌"
                type="password"
                required={mode === "create"}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">{mode === "edit" ? "留空则保持原令牌" : ""}</p>
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="mother-expire">令牌过期时间</Label>
              <Input
                id="mother-expire"
                type="datetime-local"
                value={form.token_expires_at}
                onChange={(event) => updateField("token_expires_at", event.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mother-notes">备注</Label>
              <Textarea
                id="mother-notes"
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="可选：备注信息"
                disabled={loading}
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">团队配置</Label>
              <Button type="button" variant="outline" size="sm" onClick={addTeam} disabled={loading}>
                新增团队
              </Button>
            </div>

            {form.teams.map((team, index) => (
              <Card key={index} className="border-border/40 bg-card/40">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Team ID *</Label>
                      <Input
                        value={team.team_id}
                        onChange={(event) => updateTeam(index, "team_id", event.target.value)}
                        placeholder="team-identifier"
                        disabled={loading}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Team 名称</Label>
                      <Input
                        value={team.team_name || ""}
                        onChange={(event) => updateTeam(index, "team_name", event.target.value)}
                        placeholder="可选"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={team.is_enabled}
                        onCheckedChange={(checked) => updateTeam(index, "is_enabled", checked)}
                        disabled={loading}
                      />
                      <span className="text-sm">启用</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={team.is_default}
                        onCheckedChange={() => setDefaultTeam(index)}
                        disabled={loading}
                      />
                      <span className="text-sm">设为默认</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTeam(index)}
                      disabled={loading || form.teams.length <= 1}
                    >
                      移除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "提交中..." : mode === "create" ? "创建" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

