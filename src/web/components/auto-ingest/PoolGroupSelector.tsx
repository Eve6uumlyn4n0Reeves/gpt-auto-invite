/**
 * 号池组选择组件
 */
'use client'

import { useState, useEffect } from 'react'
import { Plus, FolderOpen, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { autoIngestApi } from '@/lib/api/auto-ingest'
import type { PoolGroup } from '@/lib/api/auto-ingest'
import { toast } from 'sonner'

interface PoolGroupSelectorProps {
  onPoolGroupChange: (type: 'existing' | 'new', data: { id?: number; name?: string }) => void
}

export function PoolGroupSelector({ onPoolGroupChange }: PoolGroupSelectorProps) {
  const [poolGroups, setPoolGroups] = useState<PoolGroup[]>([])
  const [selectedType, setSelectedType] = useState<'existing' | 'new'>('existing')
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadPoolGroups()
  }, [])

  const loadPoolGroups = async () => {
    setLoading(true)
    try {
      const templates = await autoIngestApi.getTemplates()
      setPoolGroups(templates.pool_groups)
    } catch (error) {
      console.error('加载号池组失败:', error)
      toast.error('加载号池组失败')
    } finally {
      setLoading(false)
    }
  }

  const handleTypeChange = (type: 'existing' | 'new') => {
    setSelectedType(type)
    setSelectedGroupId(null)
    setNewGroupName('')
    setNewGroupDescription('')
    onPoolGroupChange(type, {})
  }

  const handleExistingGroupSelect = (groupId: number) => {
    setSelectedGroupId(groupId)
    const group = poolGroups.find(g => g.id === groupId)
    if (group) {
      onPoolGroupChange('existing', { id: groupId, name: group.name })
    }
  }

  const handleNewGroupSubmit = () => {
    if (!newGroupName.trim()) {
      toast.error('请输入号池组名称')
      return
    }

    onPoolGroupChange('new', { name: newGroupName.trim() })
  }

  const isValidSelection = () => {
    if (selectedType === 'existing') {
      return selectedGroupId !== null
    } else {
      return newGroupName.trim().length > 0
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          选择号池组
        </CardTitle>
        <CardDescription>
          选择一个现有号池组或创建新的号池组来管理母号
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup value={selectedType} onValueChange={handleTypeChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="existing" id="existing" />
            <Label htmlFor="existing" className="font-medium cursor-pointer">
              选择现有号池组
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="new" id="new" />
            <Label htmlFor="new" className="font-medium cursor-pointer">
              创建新号池组
            </Label>
          </div>
        </RadioGroup>

        <Separator />

        {selectedType === 'existing' ? (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : poolGroups.length > 0 ? (
              <div className="grid gap-3">
                {poolGroups.map((group) => (
                  <div
                    key={group.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedGroupId === group.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => handleExistingGroupSelect(group.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{group.name}</h3>
                          {selectedGroupId === group.id && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                              <Check className="h-3 w-3 mr-1" />
                              已选择
                            </Badge>
                          )}
                        </div>
                        {group.description && (
                          <p className="text-sm text-gray-600 mt-1">{group.description}</p>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        ID: {group.id}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  暂无可用号池组，请创建一个新的号池组
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="groupName">号池组名称 *</Label>
              <Input
                id="groupName"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="例如: 测试号池组、生产号池组"
                maxLength={100}
              />
              <p className="text-xs text-gray-500">
                {newGroupName.length}/100 字符
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="groupDescription">描述（可选）</Label>
              <Input
                id="groupDescription"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="描述这个号池组的用途..."
                maxLength={500}
              />
              <p className="text-xs text-gray-500">
                {newGroupDescription.length}/500 字符
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Plus className="h-4 w-4" />
              将创建新的号池组并关联到当前母号
            </div>
          </div>
        )}

        {/* 状态指示 */}
        <div className="pt-4 border-t">
          {isValidSelection() ? (
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription className="text-green-800">
                ✓ 号池组选择完成
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertDescription className="text-orange-800">
                请选择或创建一个号池组
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
