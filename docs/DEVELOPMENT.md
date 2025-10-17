# 开发指南

本文档详细介绍如何搭建开发环境、理解项目架构以及进行开发工作。

## 📋 目录

- [环境准备](#环境准备)
- [开发环境搭建](#开发环境搭建)
- [项目架构详解](#项目架构详解)
- [开发工作流](#开发工作流)
- [数据库管理](#数据库管理)
- [API 开发](#api-开发)
- [前端开发](#前端开发)
- [测试指南](#测试指南)
- [代码规范](#代码规范)
- [调试技巧](#调试技巧)

## 🛠️ 环境准备

### 必需软件

| 软件 | 版本要求 | 用途 |
|------|----------|------|
| Python | 3.10+ | 后端开发 |
| Node.js | 18+ | 前端开发 |
| pnpm | 10.17.1+ | 前端包管理 |
| Git | 2.30+ | 版本控制 |
| Docker | 20.10+ | 容器化开发 |
| VS Code | 最新版 | 推荐开发工具 |

### 推荐工具

- **数据库工具**: DBeaver 或 pgAdmin
- **API 测试**: Postman 或 Insomnia
- **浏览器**: Chrome (用于调试)
- **终端**: iTerm2 (macOS) 或 Windows Terminal

### VS Code 扩展推荐

```json
{
  "recommendations": [
    "ms-python.python",
    "ms-python.black-formatter",
    "ms-python.isort",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "ms-vscode-remote.remote-containers"
  ]
}
```

## 🏗️ 开发环境搭建

### 1. 克隆项目

```bash
git clone <repository-url>
cd "gpt invite"
```

### 2. 后端环境配置

```bash
# 进入后端目录
cd cloud/backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 安装开发依赖
pip install -r requirements-dev.txt
```

### 3. 前端环境配置

```bash
# 进入前端目录
cd cloud/web

# 安装 pnpm (如果未安装)
npm install -g pnpm

# 安装依赖
pnpm install
```

### 4. 环境变量配置

在项目根目录创建 `.env` 文件：

```env
# 数据库配置（可选）
# 未设置时后端默认使用绝对路径 cloud/backend/data/app.db
# 生产环境使用 PostgreSQL：
# DATABASE_URL=postgresql://username:password@localhost:5432/dbname

# 应用配置（与现有后端一致）
SECRET_KEY=your-secret-key-here
# 生成：openssl rand -base64 32（需32字节）
ENCRYPTION_KEY=your-32-byte-encryption-key
ADMIN_INITIAL_PASSWORD=admin123

# 开发模式
ENV=dev
NODE_ENV=development
BACKEND_URL=http://localhost:8000

# Redis 限流（可选）
# REDIS_URL=redis://localhost:6379/0
# RATE_LIMIT_ENABLED=true
# RATE_LIMIT_NAMESPACE=gpt_invite:rate
```

### 5. 数据库初始化（Alembic 迁移）

```bash
# 在后端目录执行
cd cloud/backend

# 使用 Alembic 管理表结构，首次或变更后执行迁移：
# 安装依赖后运行
alembic upgrade head

# 如模型有改动，需要生成迁移版本：
# alembic revision --autogenerate -m "描述变更" && alembic upgrade head
```

### 6. 启动开发服务

#### 方法一：分别启动

```bash
# 终端1 - 启动后端
cd cloud/backend
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

# 终端2 - 启动前端
cd cloud/web
pnpm dev
```

#### 方法二：使用开发脚本

```bash
cd cloud
chmod +x scripts/start-dev.sh
./scripts/start-dev.sh
```

### 7. 验证安装

- 后端 API: http://localhost:8000/docs
- 前端应用: http://localhost:3000
- 健康检查: http://localhost:8000/health

## 🏛️ 项目架构详解

### 后端架构 (FastAPI)

```
cloud/backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # 应用入口，FastAPI 实例
│   ├── config.py            # 配置管理
│   ├── database.py          # 数据库连接
│   ├── dependencies.py      # 依赖注入
│   │
│   ├── api/                 # API 路由
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── admin.py     # 管理员接口
│   │   │   ├── public.py    # 公开接口
│   │   │   └── redeem.py    # 兑换接口
│   │   └── deps.py          # API 依赖
│   │
│   ├── core/                # 核心功能
│   │   ├── __init__.py
│   │   ├── config.py        # 配置类
│   │   ├── security.py      # 安全相关
│   │   └── logging.py       # 日志配置
│   │
│   ├── models/              # 数据模型
│   │   ├── __init__.py
│   │   ├── base.py          # 基础模型
│   │   ├── user.py          # 用户模型
│   │   ├── mother.py        # 母号模型
│   │   ├── team.py          # 团队模型
│   │   └── code.py          # 兑换码模型
│   │
│   ├── schemas/             # Pydantic 模式
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── mother.py
│   │   ├── team.py
│   │   └── code.py
│   │
│   ├── services/            # 业务逻辑
│   │   ├── __init__.py
│   │   ├── auth.py          # 认证服务
│   │   ├── mother.py        # 母号服务
│   │   ├── code.py          # 兑换码服务
│   │   └── email.py         # 邮件服务
│   │
│   ├── utils/               # 工具函数
│   │   ├── __init__.py
│   │   ├── crypto.py        # 加密工具
│   │   ├── validators.py    # 验证工具
│   │   └── helpers.py       # 辅助函数
│   │
│   └── middleware/          # 中间件
│       ├── __init__.py
│       ├── cors.py          # CORS 中间件
│       ├── logging.py       # 日志中间件
│       └── security.py      # 安全中间件
│
├── alembic/                 # 数据库迁移
│   ├── versions/
│   ├── env.py
│   └── alembic.ini
│
├── tests/                   # 测试文件
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_api/
│   ├── test_services/
│   └── test_utils/
│
├── scripts/                 # 脚本文件
│   ├── create_admin.py
│   ├── init_db.py
│   └── backup_db.py
│
├── requirements.txt         # 生产依赖
├── requirements-dev.txt     # 开发依赖
└── Dockerfile.backend       # Docker 配置
```

### 前端架构 (Next.js)

```
cloud/web/
├── app/                     # App Router 目录
│   ├── layout.tsx           # 根布局
│   ├── page.tsx             # 首页
│   ├── globals.css          # 全局样式
│   │
│   ├── admin/               # 管理页面
│   │   ├── layout.tsx
│   │   ├── page.tsx         # 管理首页
│   │   ├── mothers/         # 母号管理
│   │   ├── codes/           # 兑换码管理
│   │   ├── users/           # 用户管理
│   │   └── dashboard/       # 数据看板
│   │
│   ├── redeem/              # 兑换页面
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   └── api/                 # API 路由
│       ├── admin/
│       │   ├── login/
│       │   ├── logout/
│       │   └── me/
│       └── redeem/
│
├── components/              # React 组件
│   ├── ui/                  # 基础 UI 组件
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── table.tsx
│   │   └── ...
│   │
│   ├── forms/               # 表单组件
│   │   ├── mother-form.tsx
│   │   ├── code-form.tsx
│   │   └── ...
│   │
│   ├── charts/              # 图表组件
│   │   ├── pie-chart.tsx
│   │   ├── line-chart.tsx
│   │   └── ...
│   │
│   └── layout/              # 布局组件
│       ├── header.tsx
│       ├── sidebar.tsx
│       └── footer.tsx
│
├── hooks/                   # 自定义 Hooks
│   ├── use-api.ts
│   ├── use-auth.ts
│   ├── use-local-storage.ts
│   └── ...
│
├── lib/                     # 工具库
│   ├── api.ts               # API 客户端
│   ├── auth.ts              # 认证工具
│   ├── utils.ts             # 通用工具
│   └── validations.ts       # 表单验证
│
├── store/                   # 状态管理
│   ├── index.ts             # Store 配置
│   ├── slices/
│   │   ├── authSlice.ts
│   │   ├── motherSlice.ts
│   │   └── ...
│   └── middleware/
│
├── styles/                  # 样式文件
│   ├── globals.css
│   └── components.css
│
├── public/                  # 静态资源
│   ├── favicon.ico
│   └── images/
│
├── types/                   # TypeScript 类型
│   ├── api.ts
│   ├── auth.ts
│   └── ...
│
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── next.config.js
└── Dockerfile.frontend
```

## 🔄 开发工作流

### 1. 功能开发流程

```bash
# 1. 创建功能分支
git checkout -b feature/new-feature

# 2. 后端开发
cd cloud/backend
# - 创建/修改数据模型
# - 实现业务逻辑
# - 添加 API 端点
# - 编写测试

# 3. 前端开发
cd cloud/web
# - 创建页面组件
# - 实现交互逻辑
# - 添加状态管理
# - 编写测试

# 4. 提交代码
git add .
git commit -m "feat: add new feature"

# 5. 推送分支
git push origin feature/new-feature

# 6. 创建 Pull Request
```

### 2. 数据库变更流程

```bash
# 1. 创建迁移文件
cd cloud/backend
alembic revision --autogenerate -m "描述变更"

# 2. 检查生成的迁移文件
# 编辑 alembic/versions/xxx_描述变更.py

# 3. 应用迁移
alembic upgrade head

# 4. 测试迁移
python -m pytest tests/test_migrations.py
```

### 3. 代码质量检查

```bash
# 后端代码检查
cd cloud/backend
black .                    # 代码格式化
isort .                    # 导入排序
flake8 .                   # 代码检查
mypy .                     # 类型检查
pytest .                   # 运行测试

# 前端代码检查
cd cloud/web
pnpm lint                  # ESLint 检查
pnpm type-check           # TypeScript 检查
pnpm test                 # 运行测试
pnpm build                # 构建检查
```

## 🗄️ 数据库管理

### 数据库迁移

```bash
# 创建新迁移
alembic revision --autogenerate -m "变更描述"

# 应用迁移
alembic upgrade head

# 回滚迁移
alembic downgrade -1

# 查看迁移历史
alembic history

# 查看当前版本
alembic current
```

### 数据库操作

```python
# 在 Python 交互环境中
from app.database import SessionLocal
from app.models import Mother, User

# 创建会话
db = SessionLocal()

# 查询数据
mothers = db.query(Mother).all()
active_mothers = db.query(Mother).filter(Mother.is_active == True).all()

# 创建数据
new_mother = Mother(
    name="测试母号",
    email="test@example.com",
    access_token="token123"
)
db.add(new_mother)
db.commit()

# 更新数据
mother = db.query(Mother).filter(Mother.id == 1).first()
mother.name = "更新后的名称"
db.commit()

# 删除数据
db.delete(mother)
db.commit()

# 关闭会话
db.close()
```

### 数据备份

```bash
# SQLite 备份
cp cloud/data/app.db cloud/data/app_backup_$(date +%Y%m%d_%H%M%S).db

# PostgreSQL 备份
pg_dump -h localhost -U username dbname > backup_$(date +%Y%m%d_%H%M%S).sql

# 使用脚本备份
cd cloud/scripts
./backup_db.sh
```

## 🔌 API 开发

### 创建新 API 端点

1. **定义 Pydantic 模式** (`app/schemas/`)

```python
# app/schemas/example.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ExampleBase(BaseModel):
    name: str
    description: Optional[str] = None

class ExampleCreate(ExampleBase):
    pass

class ExampleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class ExampleResponse(ExampleBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
```

2. **实现服务逻辑** (`app/services/`)

```python
# app/services/example.py
from sqlalchemy.orm import Session
from app.models.example import Example
from app.schemas.example import ExampleCreate, ExampleUpdate

class ExampleService:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self, skip: int = 0, limit: int = 100):
        return self.db.query(Example).offset(skip).limit(limit).all()

    def get_by_id(self, example_id: int):
        return self.db.query(Example).filter(Example.id == example_id).first()

    def create(self, example_data: ExampleCreate):
        example = Example(**example_data.dict())
        self.db.add(example)
        self.db.commit()
        self.db.refresh(example)
        return example

    def update(self, example_id: int, example_data: ExampleUpdate):
        example = self.get_by_id(example_id)
        if example:
            for field, value in example_data.dict(exclude_unset=True).items():
                setattr(example, field, value)
            self.db.commit()
            self.db.refresh(example)
        return example

    def delete(self, example_id: int):
        example = self.get_by_id(example_id)
        if example:
            self.db.delete(example)
            self.db.commit()
        return example
```

3. **创建 API 路由** (`app/api/v1/`)

```python
# app/api/v1/example.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.example import ExampleService
from app.schemas.example import ExampleCreate, ExampleUpdate, ExampleResponse

router = APIRouter(prefix="/examples", tags=["examples"])

@router.get("/", response_model=list[ExampleResponse])
def get_examples(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    service = ExampleService(db)
    return service.get_all(skip=skip, limit=limit)

@router.get("/{example_id}", response_model=ExampleResponse)
def get_example(example_id: int, db: Session = Depends(get_db)):
    service = ExampleService(db)
    example = service.get_by_id(example_id)
    if not example:
        raise HTTPException(status_code=404, detail="Example not found")
    return example

@router.post("/", response_model=ExampleResponse)
def create_example(
    example_data: ExampleCreate,
    db: Session = Depends(get_db)
):
    service = ExampleService(db)
    return service.create(example_data)

@router.put("/{example_id}", response_model=ExampleResponse)
def update_example(
    example_id: int,
    example_data: ExampleUpdate,
    db: Session = Depends(get_db)
):
    service = ExampleService(db)
    example = service.update(example_id, example_data)
    if not example:
        raise HTTPException(status_code=404, detail="Example not found")
    return example

@router.delete("/{example_id}")
def delete_example(example_id: int, db: Session = Depends(get_db)):
    service = ExampleService(db)
    example = service.delete(example_id)
    if not example:
        raise HTTPException(status_code=404, detail="Example not found")
    return {"message": "Example deleted successfully"}
```

4. **注册路由** (`app/main.py`)

```python
from app.api.v1.example import router as example_router

app.include_router(example_router, prefix="/api/v1")
```

### API 测试

```python
# tests/test_api/test_example.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_example():
    response = client.post(
        "/api/v1/examples/",
        json={"name": "Test Example", "description": "Test description"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Example"
    assert "id" in data

def test_get_examples():
    response = client.get("/api/v1/examples/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_get_example():
    # 先创建一个示例
    create_response = client.post(
        "/api/v1/examples/",
        json={"name": "Test Example"}
    )
    example_id = create_response.json()["id"]

    # 获取示例
    response = client.get(f"/api/v1/examples/{example_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == example_id
```

## 🎨 前端开发

### 创建新页面

1. **创建页面文件**

```tsx
// app/example/page.tsx
"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Example {
  id: number
  name: string
  description?: string
  created_at: string
}

export default function ExamplePage() {
  const [examples, setExamples] = useState<Example[]>([])
  const [loading, setLoading] = useState(true)
  const [newExample, setNewExample] = useState({ name: '', description: '' })

  useEffect(() => {
    fetchExamples()
  }, [])

  const fetchExamples = async () => {
    try {
      const response = await fetch('/api/v1/examples/')
      const data = await response.json()
      setExamples(data)
    } catch (error) {
      console.error('Failed to fetch examples:', error)
    } finally {
      setLoading(false)
    }
  }

  const createExample = async () => {
    try {
      const response = await fetch('/api/v1/examples/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExample)
      })
      if (response.ok) {
        setNewExample({ name: '', description: '' })
        fetchExamples()
      }
    } catch (error) {
      console.error('Failed to create example:', error)
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Examples</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Create New Example</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Name"
              value={newExample.name}
              onChange={(e) => setNewExample({ ...newExample, name: e.target.value })}
            />
            <Input
              placeholder="Description"
              value={newExample.description}
              onChange={(e) => setNewExample({ ...newExample, description: e.target.value })}
            />
            <Button onClick={createExample}>Create</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {examples.map((example) => (
          <Card key={example.id}>
            <CardHeader>
              <CardTitle>{example.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{example.description || 'No description'}</p>
              <p className="text-sm text-gray-500">
                Created: {new Date(example.created_at).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

2. **创建自定义 Hook**

```typescript
// hooks/use-examples.ts
import { useState, useEffect } from 'react'

interface Example {
  id: number
  name: string
  description?: string
  created_at: string
}

export function useExamples() {
  const [examples, setExamples] = useState<Example[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchExamples = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/v1/examples/')
      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()
      setExamples(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const createExample = async (exampleData: { name: string; description?: string }) => {
    try {
      const response = await fetch('/api/v1/examples/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exampleData)
      })
      if (!response.ok) throw new Error('Failed to create')
      const newExample = await response.json()
      setExamples(prev => [...prev, newExample])
      return newExample
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    fetchExamples()
  }, [])

  return {
    examples,
    loading,
    error,
    fetchExamples,
    createExample
  }
}
```

### 组件开发最佳实践

1. **使用 TypeScript 严格模式**

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

2. **组件 Props 定义**

```typescript
// components/ui/button.tsx
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

export { Button }
```

## 🧪 测试指南

### 后端测试

```bash
# 运行所有测试
pytest

# 运行特定测试文件
pytest tests/test_api/test_mothers.py

# 运行带覆盖率的测试
pytest --cov=app --cov-report=html

# 运行特定标记的测试
pytest -m "unit"          # 单元测试
pytest -m "integration"   # 集成测试
pytest -m "slow"          # 慢速测试
```

### 前端测试

```bash
# 运行单元测试
pnpm test

# 运行测试并生成覆盖率报告
pnpm test:coverage

# 运行 E2E 测试
pnpm test:e2e
```

### 测试示例

```python
# tests/test_services/test_mother_service.py
import pytest
from sqlalchemy.orm import Session
from app.services.mother import MotherService
from app.schemas.mother import MotherCreate

def test_create_mother(db_session: Session):
    service = MotherService(db_session)
    mother_data = MotherCreate(
        name="Test Mother",
        email="test@example.com",
        access_token="test_token"
    )

    mother = service.create(mother_data)

    assert mother.name == "Test Mother"
    assert mother.email == "test@example.com"
    assert mother.is_active is True

def test_get_available_slots(db_session: Session):
    service = MotherService(db_session)
    slots = service.get_available_slots()

    assert isinstance(slots, int)
    assert slots >= 0
```

```typescript
// __tests__/components/example.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ExamplePage } from '@/app/example/page'

// Mock fetch
global.fetch = jest.fn()

test('renders example page', () => {
  render(<ExamplePage />)
  expect(screen.getByText('Examples')).toBeInTheDocument()
})

test('creates new example', async () => {
  const mockResponse = { id: 1, name: 'Test Example', description: 'Test' }
  ;(fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => mockResponse
  })

  render(<ExamplePage />)

  const nameInput = screen.getByPlaceholderText('Name')
  const createButton = screen.getByText('Create')

  fireEvent.change(nameInput, { target: { value: 'Test Example' } })
  fireEvent.click(createButton)

  expect(fetch).toHaveBeenCalledWith('/api/v1/examples/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Example', description: '' })
  })
})
```

## 📏 代码规范

### Python 代码规范

```python
# 使用 Black 格式化
# 行长度限制 88 字符
# 使用双引号
# 函数和类之间有两个空行

# 导入顺序
import os
import sys
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.schemas.user import UserCreate

# 函数命名使用 snake_case
def create_user(user_data: UserCreate, db: Session) -> User:
    """创建新用户

    Args:
        user_data: 用户创建数据
        db: 数据库会话

    Returns:
        创建的用户对象

    Raises:
        ValueError: 当邮箱已存在时
    """
    # 实现逻辑
    pass

# 类命名使用 PascalCase
class UserService:
    """用户服务类"""

    def __init__(self, db: Session):
        self.db = db

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """根据 ID 获取用户"""
        return self.db.query(User).filter(User.id == user_id).first()
```

### TypeScript 代码规范

```typescript
// 使用 PascalCase 命名接口和类型
interface UserData {
  id: number
  name: string
  email: string
  createdAt: string
}

// 使用 camelCase 命名变量和函数
const createUserService = (userData: UserData) => {
  return {
    getUserById: (id: number): UserData | null => {
      // 实现
      return null
    }
  }
}

// 组件命名使用 PascalCase
const UserProfile = ({ user }: { user: UserData }) => {
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  )
}

// 使用类型注解
const fetchUsers = async (): Promise<UserData[]> => {
  const response = await fetch('/api/users')
  return response.json()
}

// 使用泛型
interface ApiResponse<T> {
  data: T
  message: string
}

const apiCall = async <T>(endpoint: string): Promise<ApiResponse<T>> => {
  const response = await fetch(endpoint)
  return response.json()
}
```

### Git 提交规范

```bash
# 提交消息格式
<type>(<scope>): <description>

[optional body]

[optional footer]

# 类型
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式化
refactor: 重构
test: 测试相关
chore: 构建/工具相关

# 示例
feat(api): add user creation endpoint

- Add POST /api/users endpoint
- Implement user validation
- Add unit tests

Closes #123
```

## 🐛 调试技巧

### 后端调试

1. **使用 Python 调试器**

```python
import pdb

def some_function():
    data = get_data()
    pdb.set_trace()  # 设置断点
    processed_data = process_data(data)
    return processed_data
```

2. **使用日志**

```python
import logging

logger = logging.getLogger(__name__)

def process_data(data):
    logger.info(f"Processing data: {data}")
    try:
        result = complex_operation(data)
        logger.debug(f"Operation result: {result}")
        return result
    except Exception as e:
        logger.error(f"Error processing data: {e}")
        raise
```

3. **FastAPI 调试模式**

```python
# 在开发环境启用调试
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        debug=True
    )
```

### 前端调试

1. **使用 React DevTools**

2. **使用 console 调试**

```typescript
const UserProfile = ({ user }: { user: UserData }) => {
  console.log('User data:', user)
  console.table(user)  // 表格形式显示对象

  useEffect(() => {
    console.log('Component mounted')
    return () => console.log('Component unmounted')
  }, [])

  return <div>{user.name}</div>
}
```

3. **使用 React Query DevTools**

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

function App() {
  return (
    <>
      {/* 你的应用组件 */}
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  )
}
```

### 数据库调试

```python
# 启用 SQLAlchemy 日志
import logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)

# 查看生成的 SQL
from sqlalchemy.dialects import postgresql

query = db.query(User).filter(User.is_active == True)
print(query.statement.compile(compile_kwargs={"dialect": postgresql.dialect()}))
```

---

## 📚 更多资源

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Next.js 文档](https://nextjs.org/docs)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [React TypeScript 指南](https://react-typescript-cheatsheet.netlify.app/)

如果在开发过程中遇到问题，请查看 [故障排除指南](./TROUBLESHOOTING.md) 或在项目中创建 Issue。
