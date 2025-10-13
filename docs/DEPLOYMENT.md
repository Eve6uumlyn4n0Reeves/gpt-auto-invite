# 部署和运维指南

本文档详细介绍了 ChatGPT 团队邀请管理系统的部署、配置和运维流程。

## 📋 目录

- [部署概述](#部署概述)
- [环境准备](#环境准备)
- [Docker 部署](#docker-部署)
- [手动部署](#手动部署)
- [云服务部署](#云服务部署)
- [配置管理](#配置管理)
- [数据库管理](#数据库管理)
- [监控和日志](#监控和日志)
- [备份和恢复](#备份和恢复)
- [安全配置](#安全配置)
- [性能优化](#性能优化)
- [运维脚本](#运维脚本)

## 🎯 部署概述

### 系统架构

```mermaid
graph TB
    A[用户] --> B[Nginx 反向代理]
    B --> C[Next.js 前端]
    B --> D[FastAPI 后端]
    D --> E[PostgreSQL 数据库]
    F[监控] --> D
    G[日志收集] --> D
    H[备份存储] --> E

    subgraph "负载均衡"
        B
    end

    subgraph "应用层"
        C
        D
    end

    subgraph "数据层"
        E
        H
    end

    subgraph "运维层"
        F
        G
    end
```

### 部署方式

1. **Docker Compose** - 推荐用于开发和中小型生产环境
2. **手动部署** - 适用于有特殊要求的自定义环境
3. **云服务部署** - 适用于大规模和高可用需求

## 🛠️ 环境准备

### 系统要求

#### 最低配置
- **CPU**: 2 核心
- **内存**: 4GB RAM
- **存储**: 20GB SSD
- **网络**: 100Mbps 带宽

#### 推荐配置
- **CPU**: 4 核心
- **内存**: 8GB RAM
- **存储**: 50GB SSD
- **网络**: 1Gbps 带宽

#### 软件要求
- **操作系统**: Ubuntu 20.04+ / CentOS 8+ / RHEL 8+
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Git**: 2.30+

### 端口要求

| 端口 | 用途 | 说明 |
|------|------|------|
| 80 | HTTP | Web 访问 |
| 443 | HTTPS | 安全 Web 访问 |
| 8000 | 后端 API | FastAPI 服务 |
| 3000 | 前端 | Next.js 开发服务器 |
| 5432 | 数据库 | PostgreSQL |
| 22 | SSH | 远程管理 |

## 🐳 Docker 部署

### 1. 快速开始（生产模板）

```bash
# 克隆项目
git clone <repository-url>
cd "gpt invite"

# 创建生产环境变量
cp cloud/.env.production.example cloud/.env
# 编辑 cloud/.env，至少设置：DOMAIN、ADMIN_INITIAL_PASSWORD、SECRET_KEY、ENCRYPTION_KEY、DATABASE_URL、REDIS_URL

# 校验配置（可选）
bash cloud/scripts/verify-prod.sh cloud/.env

# 使用生产模板启动（PostgreSQL + Redis + Backend + Frontend + Nginx）
docker compose -f cloud/docker-compose.prod.yml --env-file cloud/.env up -d
```

### 2. 环境变量配置（与当前代码对齐）

创建 `cloud/.env` 文件（生产）：

```env
# 运行模式
ENV=production
NODE_ENV=production
DOMAIN=your-domain.com

# 数据库（生产建议 PostgreSQL）
DATABASE_URL=postgresql+psycopg2://postgres:your_secure_password@postgres:5432/invite_db
POSTGRES_DB=invite_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password

# 管理员与密钥（必填）
ADMIN_INITIAL_PASSWORD=replace-with-strong-password
SECRET_KEY=replace-with-strong-secret-key
# 32-byte base64（openssl rand -base64 32）
ENCRYPTION_KEY=

# Redis 限流（推荐生产开启）
REDIS_URL=redis://redis:6379/0
RATE_LIMIT_ENABLED=true
RATE_LIMIT_NAMESPACE=gpt_invite:rate

# 策略
ADMIN_SESSION_TTL_SECONDS=604800
TOKEN_DEFAULT_TTL_DAYS=40
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCKOUT_DURATION=300

# 前端服务端访问后端
BACKEND_URL=http://backend:8000

# SMTP（可选；当前后端未使用邮件发送逻辑，可留空）
# SMTP_HOST=
# SMTP_PORT=
# SMTP_USER=
# SMTP_PASS=
```

### 3. Docker Compose 配置

生产使用的 Compose 已内置在仓库：`cloud/docker-compose.prod.yml`，包含 PostgreSQL、Redis、后端、前端与 Nginx。建议直接使用该文件，结合 `cloud/.env`。

### 4. Nginx 配置

`nginx/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:8000;
    }

    upstream frontend {
        server frontend:3000;
    }

    # HTTP 重定向到 HTTPS
    server {
        listen 80;
        server_name your-domain.com www.your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS 配置
    server {
        listen 443 ssl http2;
        server_name your-domain.com www.your-domain.com;

        # SSL 证书配置
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # 安全头
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

        # 前端路由
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # API 路由
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # WebSocket 支持
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # 静态文件缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # 文件上传大小限制
        client_max_body_size 10M;
    }
}
```

### 5. 部署脚本

- 生产配置校验脚本：`cloud/scripts/verify-prod.sh`
- （可选）在 CI/CD 中调用上述脚本与 `docker compose -f cloud/docker-compose.prod.yml --env-file cloud/.env up -d` 完成一键部署

> 说明：本文件早期版本中包含 PM2、Alembic、监控（Prometheus/Grafana）、上传备份等示例，当前仓库未提供相关脚本与目录，已移除或标注为可选扩展。建议直接使用 `cloud/docker-compose.prod.yml` 进行生产部署。

## 🔧 手动部署

### 1. 数据库安装

#### PostgreSQL 安装

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

#### 数据库配置

```bash
# 创建数据库和用户
sudo -u postgres psql
CREATE DATABASE invite_db;
CREATE USER invite_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE invite_db TO invite_user;
\q
```

### 2. 后端部署

```bash
# 进入后端目录
cd cloud/backend

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
export DATABASE_URL="postgresql://invite_user:password@localhost:5432/invite_db"
export SECRET_KEY="your_secret_key"
export ENCRYPTION_KEY="your_encryption_key"

# 运行数据库迁移
alembic upgrade head

# 启动服务
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 3. 前端部署

```bash
# 进入前端目录
cd cloud/web

# 安装依赖
pnpm install

# 构建生产版本
pnpm build

# 启动服务
pnpm start
```

### 4. 进程管理（可选）

如需脱离容器使用 PM2 等进程管理器，自行编写配置并注意与本项目环境变量保持一致。官方推荐生产部署方式仍为 `cloud/docker-compose.prod.yml`。

## ☁️ 云服务部署

### 1. AWS 部署

#### EC2 实例配置

```bash
# 创建 EC2 实例 (Ubuntu 20.04)
aws ec2 run-instances \
  --image-id ami-12345678 \
  --instance-type t3.medium \
  --key-name my-key-pair \
  --security-group-ids sg-12345678 \
  --subnet-id subnet-12345678 \
  --user-data file://user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=invite-app}]'
```

#### 用户数据脚本 (`user-data.sh`)

```bash
#!/bin/bash
apt-get update
apt-get install -y docker.io docker-compose git

# 拉取项目
git clone https://github.com/your-repo/invite-system.git
cd invite-system/cloud

# 配置环境变量
cat > .env << EOF
DATABASE_URL=postgresql://postgres:password@postgres:5432/invite_db
POSTGRES_PASSWORD=your_secure_password
ADMIN_INITIAL_PASSWORD=your_admin_password
SECRET_KEY=your_secret_key
ENCRYPTION_KEY=your_encryption_key
EOF

# 启动服务
docker-compose up -d
```

#### RDS 数据库

```bash
# 创建 RDS 实例
aws rds create-db-instance \
  --db-instance-identifier invite-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username postgres \
  --master-user-password your_password \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-12345678 \
  --db-subnet-group-name default
```

### 2. 阿里云部署

#### ECS 实例创建

```bash
# 使用 ECS 控制台或 CLI 创建实例
# 配置安全组开放 80, 443, 22 端口
# 安装 Docker 和 Docker Compose
```

#### RDS 数据库

```bash
# 创建 RDS PostgreSQL 实例
aliyun rds CreateDBInstance \
  --RegionId cn-hangzhou \
  --Engine PostgreSQL \
  --EngineVersion 13.0 \
  --DBInstanceClass pg.n2.small.1 \
  --DBInstanceStorage 20
```

### 3. 腾讯云部署

```bash
# 创建 CVM 实例
# 配置安全组
# 使用 Docker Compose 部署
```

## ⚙️ 配置管理

### 1. 环境变量管理

#### 生产环境配置

```bash
# 创建配置目录
mkdir -p /etc/invite-system
chmod 700 /etc/invite-system

# 创建环境配置文件
cat > /etc/invite-system/.env << EOF
# 生产环境配置
NODE_ENV=production
DEBUG=false

# 数据库配置 (使用环境变量或密钥管理服务)
DATABASE_URL=postgresql://user:password@db-host:5432/dbname

# 密钥配置 (使用密钥管理服务)
SECRET_KEY=\${INVITE_SECRET_KEY}
ENCRYPTION_KEY=\${INVITE_ENCRYPTION_KEY}
JWT_SECRET_KEY=\${INVITE_JWT_SECRET}

# 管理员配置
ADMIN_INITIAL_PASSWORD=\${INVITE_ADMIN_PASSWORD}

# 邮件配置
SMTP_HOST=\${INVITE_SMTP_HOST}
SMTP_PORT=\${INVITE_SMTP_PORT}
SMTP_USER=\${INVITE_SMTP_USER}
SMTP_PASS=\${INVITE_SMTP_PASS}
EOF

# 设置权限
chmod 600 /etc/invite-system/.env
chown app:app /etc/invite-system/.env
```

#### 配置验证脚本

```bash
#!/bin/bash
# scripts/validate-config.sh

echo "验证环境配置..."

# 检查必需的环境变量
required_vars=(
    "DATABASE_URL"
    "SECRET_KEY"
    "ENCRYPTION_KEY"
    "ADMIN_INITIAL_PASSWORD"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "错误: 环境变量 $var 未设置"
        exit 1
    fi
done

# 测试数据库连接
python -c "
import os
from sqlalchemy import create_engine
try:
    engine = create_engine(os.environ['DATABASE_URL'])
    with engine.connect() as conn:
        conn.execute('SELECT 1')
    print('✅ 数据库连接正常')
except Exception as e:
    print(f'❌ 数据库连接失败: {e}')
    exit(1)
"

echo "✅ 配置验证通过"
```

### 2. 密钥管理

#### HashiCorp Vault 集成

```bash
# 安装 Vault
wget https://releases.hashicorp.com/vault/1.12.0/vault_1.12.0_linux_amd64.zip
unzip vault_1.12.0_linux_amd64.zip
sudo mv vault /usr/local/bin/

# 配置 Vault
vault login <token>

# 存储密钥
vault kv put secret/invite-system \
    secret_key="your_secret_key" \
    encryption_key="your_encryption_key" \
    jwt_secret="your_jwt_secret" \
    admin_password="your_admin_password"

# 读取密钥
export SECRET_KEY=$(vault kv get -field=secret_key secret/invite-system)
export ENCRYPTION_KEY=$(vault kv get -field=encryption_key secret/invite-system)
```

#### AWS Secrets Manager

```bash
# 创建密钥
aws secretsmanager create-secret \
  --name invite-system/credentials \
  --secret-string '{"SECRET_KEY":"your_secret_key","ENCRYPTION_KEY":"your_encryption_key"}'

# 读取密钥
SECRET_VALUE=$(aws secretsmanager get-secret-value \
  --secret-id invite-system/credentials \
  --query SecretString \
  --output text)

export SECRET_KEY=$(echo $SECRET_VALUE | jq -r '.SECRET_KEY')
export ENCRYPTION_KEY=$(echo $SECRET_VALUE | jq -r '.ENCRYPTION_KEY')
```

## 🗄️ 数据库管理

### 1. 数据库迁移

```bash
# 创建新迁移
alembic revision --autogenerate -m "描述变更"

# 应用迁移
alembic upgrade head

# 回滚迁移
alembic downgrade -1

# 查看迁移历史
alembic history

# 查看当前版本
alembic current
```

### 2. 数据库优化

#### 索引优化

```sql
-- 创建索引
CREATE INDEX CONCURRENTLY idx_codes_batch_id ON codes(batch_id);
CREATE INDEX CONCURRENTLY idx_codes_status ON codes(is_used, expires_at);
CREATE INDEX CONCURRENTLY idx_users_email_team ON users(email, team_id);
CREATE INDEX CONCURRENTLY idx_mothers_status ON mothers(is_active, is_valid);

-- 分析表统计信息
ANALYZE mothers;
ANALYZE codes;
ANALYZE users;
ANALYZE teams;
```

#### 查询优化

```sql
-- 查看慢查询
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC
LIMIT 10;

-- 查看表大小
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### 3. 数据库备份

#### 自动备份脚本

```bash
#!/bin/bash
# scripts/backup-db.sh

BACKUP_DIR="/backup/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="invite_db"
RETENTION_DAYS=30

# 创建备份目录
mkdir -p $BACKUP_DIR

# 执行备份
pg_dump $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# 删除旧备份
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# 上传到云存储 (可选)
if command -v aws &> /dev/null; then
    aws s3 cp $BACKUP_DIR/backup_$DATE.sql.gz s3://your-backup-bucket/postgresql/
fi

echo "数据库备份完成: backup_$DATE.sql.gz"
```

#### 备份 Cron 任务

```bash
# 添加到 crontab
crontab -e

# 每天凌晨 2 点备份
0 2 * * * /path/to/scripts/backup-db.sh

# 每周日完整备份
0 2 * * 0 /path/to/scripts/full-backup.sh
```

## 📊 监控和日志（可选示例）

### 1. 应用监控

#### Prometheus 配置

`monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'invite-backend'
    static_configs:
      - targets: ['backend:8000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:80']
```

#### Grafana 仪表板

```json
{
  "dashboard": {
    "title": "邀请系统监控",
    "panels": [
      {
        "title": "API 请求率",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{endpoint}}"
          }
        ]
      },
      {
        "title": "响应时间",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "数据库连接数",
        "type": "singlestat",
        "targets": [
          {
            "expr": "pg_stat_database_numbackends",
            "legendFormat": "连接数"
          }
        ]
      }
    ]
  }
}
```

### 2. 日志管理

#### 日志配置

```python
# app/core/logging.py
import logging
import sys
from pathlib import Path

def setup_logging():
    # 创建日志目录
    log_dir = Path("/app/logs")
    log_dir.mkdir(exist_ok=True)

    # 配置日志格式
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # 文件处理器
    file_handler = logging.FileHandler(log_dir / "app.log")
    file_handler.setFormatter(formatter)

    # 控制台处理器
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    # 配置根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
```

#### 日志轮转

`/etc/logrotate.d/invite-system`:

```
/app/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 app app
    postrotate
        docker-compose exec backend kill -USR1 1
    endscript
}
```

### 3. 健康检查

#### 后端健康检查

```python
# app/api/v1/health.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.redis import redis_client

router = APIRouter()

@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """系统健康检查"""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "checks": {}
    }

    # 检查数据库
    try:
        db.execute("SELECT 1")
        health_status["checks"]["database"] = "healthy"
    except Exception as e:
        health_status["checks"]["database"] = f"unhealthy: {str(e)}"
        health_status["status"] = "unhealthy"

    # 检查 Redis
    try:
        redis_client.ping()
        health_status["checks"]["redis"] = "healthy"
    except Exception as e:
        health_status["checks"]["redis"] = f"unhealthy: {str(e)}"
        health_status["status"] = "unhealthy"

    return health_status
```

## 💾 备份和恢复（示例）

### 1. 自动备份

#### 完整备份脚本

```bash
#!/bin/bash
# scripts/full-backup.sh

BACKUP_BASE="/backup"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# 创建备份目录
BACKUP_DIR="$BACKUP_BASE/full_backup_$DATE"
mkdir -p $BACKUP_DIR

echo "开始完整备份..."

# 1. 数据库备份
echo "备份数据库..."
pg_dump invite_db | gzip > $BACKUP_DIR/database.sql.gz

# 2. 文件备份
echo "备份上传文件..."
tar -czf $BACKUP_DIR/uploads.tar.gz /app/data/uploads

# 3. 配置文件备份
echo "备份配置文件..."
cp /etc/invite-system/.env $BACKUP_DIR/env.backup

# 4. 日志备份
echo "备份日志文件..."
tar -czf $BACKUP_DIR/logs.tar.gz /app/logs

# 5. 创建备份清单
echo "创建备份清单..."
cat > $BACKUP_DIR/manifest.txt << EOF
备份时间: $(date)
备份类型: 完整备份
系统版本: $(git rev-parse HEAD)
文件清单:
- database.sql.gz: 数据库备份
- uploads.tar.gz: 上传文件备份
- env.backup: 环境配置备份
- logs.tar.gz: 日志文件备份
EOF

# 6. 压缩整个备份
echo "压缩备份..."
cd $BACKUP_BASE
tar -czf full_backup_$DATE.tar.gz full_backup_$DATE/
rm -rf full_backup_$DATE/

# 7. 上传到云存储
if command -v aws &> /dev/null; then
    echo "上传到 AWS S3..."
    aws s3 cp $BACKUP_BASE/full_backup_$DATE.tar.gz s3://your-backup-bucket/full/
fi

# 8. 清理旧备份
echo "清理旧备份..."
find $BACKUP_BASE -name "full_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "完整备份完成: full_backup_$DATE.tar.gz"
```

### 2. 恢复流程

#### 数据库恢复

```bash
#!/bin/bash
# scripts/restore-db.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "用法: $0 <backup_file>"
    exit 1
fi

echo "开始恢复数据库..."

# 1. 停止应用服务
docker-compose stop backend

# 2. 解压备份文件
gunzip -c $BACKUP_FILE > temp_restore.sql

# 3. 恢复数据库
psql -h localhost -U postgres -d invite_db < temp_restore.sql

# 4. 清理临时文件
rm temp_restore.sql

# 5. 启动应用服务
docker-compose start backend

echo "数据库恢复完成"
```

#### 完整系统恢复

```bash
#!/bin/bash
# scripts/full-restore.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "用法: $0 <backup_tar_file>"
    exit 1
fi

echo "开始完整系统恢复..."

# 1. 停止所有服务
docker-compose down

# 2. 解压备份文件
BACKUP_DIR="restore_$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR
tar -xzf $BACKUP_FILE -C $BACKUP_DIR

cd $BACKUP_DIR

# 3. 恢复配置文件
echo "恢复配置文件..."
sudo cp env.backup /etc/invite-system/.env

# 4. 恢复数据库
echo "恢复数据库..."
gunzip -c database.sql.gz | psql -h localhost -U postgres -d invite_db

# 5. 恢复上传文件
echo "恢复上传文件..."
sudo tar -xzf uploads.tar.gz -C /

# 6. 恢复日志文件 (可选)
echo "恢复日志文件..."
sudo tar -xzf logs.tar.gz -C /

# 7. 启动服务
echo "启动服务..."
cd /path/to/invite-system/cloud
docker-compose up -d

# 8. 等待服务启动
sleep 30

# 9. 验证恢复
if curl -f http://localhost:8000/health; then
    echo "✅ 系统恢复成功!"
else
    echo "❌ 系统恢复失败"
    exit 1
fi

# 清理临时文件
cd ..
rm -rf $BACKUP_DIR

echo "系统恢复完成"
```

## 🔒 安全配置

### 1. SSL/TLS 配置

#### Let's Encrypt 证书

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 自动续期
sudo crontab -e
# 添加以下行
0 12 * * * /usr/bin/certbot renew --quiet
```

#### SSL 配置

```nginx
# nginx/ssl.conf
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# HSTS
add_header Strict-Transport-Security "max-age=31536000" always;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
```

### 2. 防火墙配置

```bash
# UFW 配置
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 允许 SSH
sudo ufw allow ssh

# 允许 HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# 查看状态
sudo ufw status
```

### 3. 应用安全

#### 安全头配置

```python
# app/middleware/security.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

def add_security_middleware(app: FastAPI):
    # 强制 HTTPS
    app.add_middleware(HTTPSRedirectMiddleware)

    # CORS 配置
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["https://your-domain.com"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )
```

#### 输入验证

```python
# app/utils/validators.py
import re
from typing import Optional

def validate_email(email: str) -> bool:
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_access_token(token: str) -> bool:
    # ChatGPT access token 格式验证
    pattern = r'^sk-[a-zA-Z0-9]{48}$'
    return re.match(pattern, token) is not None

def sanitize_input(input_str: str) -> str:
    # 移除潜在的恶意字符
    dangerous_chars = ['<', '>', '"', "'", '&', 'script', 'javascript']
    sanitized = input_str
    for char in dangerous_chars:
        sanitized = sanitized.replace(char, '')
    return sanitized.strip()
```

## 🚀 性能优化

### 1. 数据库优化

```sql
-- 连接池配置
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- 重启 PostgreSQL 使配置生效
SELECT pg_reload_conf();
```

### 2. 应用优化

#### 缓存配置

```python
# app/core/cache.py
import redis
from functools import wraps

redis_client = redis.Redis(host='redis', port=6379, db=0)

def cache_result(expire_time: int = 300):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 生成缓存键
            cache_key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"

            # 尝试从缓存获取
            cached_result = redis_client.get(cache_key)
            if cached_result:
                return json.loads(cached_result)

            # 执行函数并缓存结果
            result = await func(*args, **kwargs)
            redis_client.setex(
                cache_key,
                expire_time,
                json.dumps(result, default=str)
            )
            return result
        return wrapper
    return decorator
```

### 3. 前端优化

```typescript
// next.config.js
module.exports = {
  // 启用压缩
  compress: true,

  // 静态资源优化
  images: {
    domains: ['your-domain.com'],
    formats: ['image/webp', 'image/avif'],
  },

  // 构建优化
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback.fs = false;
    }
    return config;
  },

  // 实验性功能
  experimental: {
    appDir: true,
    serverComponentsExternalPackages: ['@prisma/client'],
  },
}
```

## 📋 运维脚本

### 1. 服务管理

```bash
#!/bin/bash
# scripts/manage-services.sh

case "$1" in
    start)
        echo "启动服务..."
        docker-compose up -d
        ;;
    stop)
        echo "停止服务..."
        docker-compose down
        ;;
    restart)
        echo "重启服务..."
        docker-compose restart
        ;;
    status)
        echo "服务状态:"
        docker-compose ps
        ;;
    logs)
        echo "查看日志:"
        docker-compose logs -f
        ;;
    update)
        echo "更新服务..."
        ./scripts/deploy.sh
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs|update}"
        exit 1
        ;;
esac
```

### 2. 健康检查

```bash
#!/bin/bash
# scripts/health-check.sh

echo "执行系统健康检查..."

# 检查服务状态
services=("postgres" "redis" "backend" "frontend" "nginx")
for service in "${services[@]}"; do
    if docker-compose ps $service | grep -q "Up"; then
        echo "✅ $service: 运行中"
    else
        echo "❌ $service: 未运行"
    fi
done

# 检查 API 健康状态
if curl -f http://localhost:8000/health &> /dev/null; then
    echo "✅ API: 健康"
else
    echo "❌ API: 不健康"
fi

# 检查前端
if curl -f http://localhost:3000 &> /dev/null; then
    echo "✅ 前端: 可访问"
else
    echo "❌ 前端: 不可访问"
fi

# 检查磁盘空间
disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $disk_usage -gt 80 ]; then
    echo "⚠️  磁盘使用率: ${disk_usage}% (警告)"
else
    echo "✅ 磁盘使用率: ${disk_usage}%"
fi

# 检查内存使用
memory_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
if [ $memory_usage -gt 80 ]; then
    echo "⚠️  内存使用率: ${memory_usage}% (警告)"
else
    echo "✅ 内存使用率: ${memory_usage}%"
fi

echo "健康检查完成"
```

### 3. 日志分析

```bash
#!/bin/bash
# scripts/analyze-logs.sh

LOG_DIR="/app/logs"
TODAY=$(date +%Y-%m-%d)

echo "分析今日日志 ($TODAY)..."

# 错误统计
echo "错误统计:"
grep -i "error" $LOG_DIR/app.log | grep $TODAY | wc -l

# 警告统计
echo "警告统计:"
grep -i "warning" $LOG_DIR/app.log | grep $TODAY | wc -l

# API 请求统计
echo "API 请求统计:"
grep "POST\|GET\|PUT\|DELETE" $LOG_DIR/app.log | grep $TODAY | wc -l

# 响应时间统计
echo "平均响应时间:"
grep "response_time" $LOG_DIR/app.log | grep $TODAY | awk '{print $NF}' | awk '{sum+=$1; count++} END {if(count>0) print sum/count " ms"}'

# 错误详情
echo "今日错误详情:"
grep -i "error" $LOG_DIR/app.log | grep $TODAY | tail -10
```

### 4. 性能监控

```bash
#!/bin/bash
# scripts/performance-monitor.sh

echo "系统性能监控 - $(date)"

# CPU 使用率
cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
echo "CPU 使用率: ${cpu_usage}%"

# 内存使用
memory_info=$(free -h | awk 'NR==2{printf "内存使用: %s/%s (%.1f%%)", $3,$2,$3*100/$2}')
echo $memory_info

# 磁盘 I/O
disk_io=$(iostat -x 1 1 | awk 'NR==4 {print "磁盘 I/O: " $10 "% 读取, " $14 "% 写入"}')
echo $disk_io

# 网络流量
network=$(cat /proc/net/dev | grep eth0 | awk '{print "网络流量: 接收 " $2 " 字节, 发送 " $10 " 字节"}')
echo $network

# 数据库连接数
db_connections=$(psql -U postgres -d invite_db -t -c "SELECT count(*) FROM pg_stat_activity;")
echo "数据库连接数: $db_connections"

# Redis 内存使用
redis_memory=$(redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
echo "Redis 内存使用: $redis_memory"
```

---

## 📞 故障处理

### 常见问题解决

1. **服务无法启动**
   - 检查端口占用: `netstat -tlnp | grep :8000`
   - 查看日志: `docker-compose logs backend`
   - 检查环境变量配置

2. **数据库连接失败**
   - 检查数据库服务状态
   - 验证连接字符串
   - 检查防火墙设置

3. **前端无法访问后端**
   - 检查 Nginx 配置
   - 验证 CORS 设置
   - 检查网络连接

如需更多帮助，请查看 [故障排除指南](./TROUBLESHOOTING.md) 或联系技术支持。
