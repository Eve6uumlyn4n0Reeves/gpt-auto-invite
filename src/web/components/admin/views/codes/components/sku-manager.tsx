import { useMemo, useState, type FormEvent } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { CodeSkuSummary } from "@/shared/api-types"
import type { CodeSkuPayload } from "@/lib/api/codes"

interface CodeSkuManagerProps {
  skus: CodeSkuSummary[]
  loading: boolean
  onCreate: (payload: CodeSkuPayload) => Promise<void>
  onUpdate: (id: number, payload: Partial<CodeSkuPayload>) => Promise<void>
  onRefresh: () => Promise<void>
}

const emptyForm: CodeSkuPayload = {
  name: "",
  slug: "",
  description: "",
  lifecycle_days: 7,
  default_refresh_limit: 3,
  price_cents: null,
  is_active: true,
}

export function CodeSkuManager({ skus, loading, onCreate, onUpdate, onRefresh }: CodeSkuManagerProps) {
  const [mode, setMode] = useState<"create" | "edit">("create")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<CodeSkuPayload>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const handleSelectSku = (sku: CodeSkuSummary) => {
    setMode("edit")
    setEditingId(sku.id)
    setForm({
      name: sku.name,
      slug: sku.slug,
      description: sku.description ?? "",
      lifecycle_days: sku.lifecycle_days,
      default_refresh_limit: sku.default_refresh_limit ?? null,
      price_cents: sku.price_cents ?? null,
      is_active: sku.is_active,
    })
  }

  const resetForm = () => {
    setMode("create")
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (mode === "create" && !form.slug) return
    setSubmitting(true)
    try {
      if (mode === "create") {
        await onCreate(form)
      } else if (editingId) {
        const { slug, ...rest } = form
        await onUpdate(editingId, rest)
      }
      resetForm()
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败"
      window.alert(message)
    } finally {
      setSubmitting(false)
    }
  }

  const activeCount = useMemo(() => skus.filter((sku) => sku.is_active).length, [skus])

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">兑换码商品配置</CardTitle>
        <CardDescription>管理不同生命周期/刷新策略的商品类型</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>当前商品：{skus.length}（启用 {activeCount}）</span>
            <Button type="button" variant="outline" size="sm" onClick={() => onRefresh()} disabled={loading}>
              刷新列表
            </Button>
          </div>
          <div className="overflow-auto rounded-md border border-border/50">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">名称</th>
                  <th className="px-3 py-2 text-left font-medium">生命周期</th>
                  <th className="px-3 py-2 text-left font-medium">刷新额度</th>
                  <th className="px-3 py-2 text-left font-medium">状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {skus.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                      暂无商品，请先创建。
                    </td>
                  </tr>
                )}
                {skus.map((sku) => (
                  <tr key={sku.id} className="border-t border-border/40">
                    <td className="px-3 py-2">
                      <div className="font-medium">{sku.name}</div>
                      <div className="text-xs text-muted-foreground">{sku.slug}</div>
                    </td>
                    <td className="px-3 py-2">{sku.lifecycle_days} 天</td>
                    <td className="px-3 py-2">
                      {sku.default_refresh_limit === null || sku.default_refresh_limit === undefined
                        ? "无限"
                        : `${sku.default_refresh_limit} 次`}
                    </td>
                    <td className="px-3 py-2">{sku.is_active ? "启用" : "停用"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectSku(sku)}
                        disabled={submitting}
                      >
                        编辑
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="skuName">名称</Label>
            <Input
              id="skuName"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="skuSlug">标识（slug）</Label>
            <Input
              id="skuSlug"
              value={form.slug}
              onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))}
              disabled={mode === "edit"}
              required={mode === "create"}
            />
          </div>
          <div>
            <Label htmlFor="skuLifecycle">生命周期（天）</Label>
            <Input
              id="skuLifecycle"
              type="number"
              min={1}
              max={90}
              value={form.lifecycle_days}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, lifecycle_days: Math.max(1, Number(event.target.value) || 1) }))
              }
            />
          </div>
          <div>
            <Label htmlFor="skuRefresh">刷新额度（为空=无限）</Label>
            <Input
              id="skuRefresh"
              type="number"
              min={0}
              value={form.default_refresh_limit ?? ""}
              onChange={(event) => {
                const value = event.target.value
                setForm((prev) => ({
                  ...prev,
                  default_refresh_limit: value === "" ? null : Math.max(0, Number(value) || 0),
                }))
              }}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="skuDescription">说明（可选）</Label>
            <Input
              id="skuDescription"
              value={form.description ?? ""}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="skuActive"
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            />
            <Label htmlFor="skuActive" className="mb-0">
              启用
            </Label>
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button type="submit" disabled={submitting || loading}>
              {submitting ? "保存中..." : mode === "create" ? "创建商品" : "保存修改"}
            </Button>
            {mode === "edit" && (
              <Button type="button" variant="outline" onClick={() => resetForm()} disabled={submitting}>
                取消编辑
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

