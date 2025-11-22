#!/bin/bash

# 分布式限流器部署脚本
# 用于自动配置Redis和限流器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi

    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi

    # 检查Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3未安装"
        exit 1
    fi

    log_success "依赖检查通过"
}

# 创建环境配置文件
create_env_file() {
    log_info "创建环境配置文件..."

    ENV_FILE="../.env"

    if [ -f "$ENV_FILE" ]; then
        log_warning ".env文件已存在，将备份当前文件"
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    fi

    cat > "$ENV_FILE" << EOF
# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_URL=redis://localhost:6379/0

# 限流配置
RATE_LIMIT_ENABLED=true
RATE_LIMIT_NAMESPACE=gpt_invite:rate

# 其他配置保持不变...
EOF

    log_success "环境配置文件已创建: $ENV_FILE"
}

# 启动Redis
setup_redis() {
    log_info "设置Redis..."

    # 检查Redis是否已运行
    if docker ps | grep -q "redis.*rate-limit"; then
        log_warning "Redis容器已在运行，跳过启动"
        return
    fi

    # 创建Redis数据目录
    mkdir -p ./data/redis

    # 启动Redis容器
    log_info "启动Redis容器..."
    docker run -d \
        --name redis-rate-limit \
        -p 6379:6379 \
        -v "$(pwd)/data/redis:/data" \
        --restart unless-stopped \
        redis:7-alpine redis-server \
        --appendonly yes \
        --maxmemory 256mb \
        --maxmemory-policy allkeys-lru

    # 等待Redis启动
    log_info "等待Redis启动..."
    sleep 5

    # 测试Redis连接
    if docker exec redis-rate-limit redis-cli ping | grep -q "PONG"; then
        log_success "Redis启动成功"
    else
        log_error "Redis启动失败"
        exit 1
    fi
}

# 安装Python依赖
install_python_deps() {
    log_info "安装Python依赖..."

    cd ../backend

    # 检查requirements.txt
    if [ ! -f "requirements.txt" ]; then
        log_warning "requirements.txt不存在，创建基础依赖文件"
        cat > requirements.txt << EOF
fastapi>=0.68.0
uvicorn>=0.15.0
redis>=4.5.0
sqlalchemy>=1.4.0
python-multipart>=0.0.5
python-jose>=3.3.0
passlib>=1.7.4
python-dotenv>=0.19.0
EOF
    fi

    # 安装依赖
    if command -v pip3 &> /dev/null; then
        pip3 install -r requirements.txt
    elif command -v pip &> /dev/null; then
        pip install -r requirements.txt
    else
        log_error "pip未找到"
        exit 1
    fi

    log_success "Python依赖安装完成"
    cd -
}

# 创建Docker Compose配置
create_docker_compose() {
    log_info "创建Docker Compose配置..."

    cat > docker-compose.rate-limit.yml << EOF
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: redis-rate-limit
    ports:
      - "6379:6379"
    volumes:
      - ./data/redis:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  backend:
    build: ../backend
    container_name: app-rate-limit
    ports:
      - "8000:8000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - RATE_LIMIT_ENABLED=true
      - RATE_LIMIT_NAMESPACE=gpt_invite:rate
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    volumes:
      - ../backend:/app

  frontend:
    build: ../web
    container_name: frontend-rate-limit
    ports:
      - "3000:3000"
    depends_on:
      - backend
    restart: unless-stopped
    volumes:
      - ../web:/app

volumes:
  redis_data:
    driver: local
EOF

    log_success "Docker Compose配置已创建"
}

# 创建Redis配置文件
create_redis_config() {
    log_info "创建Redis配置文件..."

    cat > redis.conf << EOF
# 基础配置
bind 0.0.0.0
port 6379
timeout 0
tcp-keepalive 300

# 内存配置
maxmemory 256mb
maxmemory-policy allkeys-lru

# 持久化配置
save 900 1
save 300 10
save 60 10000

# AOF配置
appendonly yes
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# 日志配置
loglevel notice
logfile /var/log/redis/redis.log

# 安全配置
# requirepass your_redis_password

# 性能优化
tcp-backlog 511
databases 16
EOF

    log_success "Redis配置文件已创建"
}

# 测试限流器
test_rate_limiter() {
    log_info "测试限流器..."

    # 启动后端服务
    cd ../backend
    log_info "启动后端服务..."
    uvicorn app.main:app --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!

    # 等待服务启动
    sleep 10

    # 测试健康检查
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        log_success "后端服务启动成功"
    else
        log_error "后端服务启动失败"
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi

    # 测试限流器健康检查
    log_info "测试限流器健康状态..."
    if curl -f http://localhost:8000/api/admin/rate-limit/health > /dev/null 2>&1; then
        log_success "限流器健康检查通过"
    else
        log_warning "限流器健康检查失败，可能需要管理员权限"
    fi

    # 停止测试服务
    kill $BACKEND_PID 2>/dev/null
    cd -
}

# 创建监控脚本
create_monitoring_script() {
    log_info "创建监控脚本..."

    cat > monitor-rate-limit.sh << 'EOF'
#!/bin/bash

# 限流器监控脚本

REDIS_CONTAINER="redis-rate-limit"
BACKEND_CONTAINER="app-rate-limit"

echo "=== 限流器监控 ==="
echo "时间: $(date)"
echo

# Redis状态
echo "1. Redis状态:"
if docker ps | grep -q $REDIS_CONTAINER; then
    echo "   ✅ Redis容器运行中"
    REDIS_INFO=$(docker exec $REDIS_CONTAINER redis-cli info memory | grep used_memory_human)
    echo "   内存使用: $REDIS_INFO"
else
    echo "   ❌ Redis容器未运行"
fi
echo

# 后端状态
echo "2. 后端服务状态:"
if docker ps | grep -q $BACKEND_CONTAINER; then
    echo "   ✅ 后端容器运行中"
    # 测试健康检查
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        echo "   ✅ 健康检查通过"
    else
        echo "   ❌ 健康检查失败"
    fi
else
    echo "   ❌ 后端容器未运行"
fi
echo

# 限流器摘要
echo "3. 限流器摘要:"
if curl -s http://localhost:8000/api/admin/rate-limit/summary > /dev/null 2>&1; then
    curl -s http://localhost:8000/api/admin/rate-limit/summary | jq .
else
    echo "   ❌ 无法获取限流器摘要"
fi
echo

echo "=== 监控完成 ==="
EOF

    chmod +x monitor-rate-limit.sh
    log_success "监控脚本已创建: monitor-rate-limit.sh"
}

# 主函数
main() {
    echo "========================================"
    echo "    分布式限流器自动部署脚本"
    echo "========================================"
    echo

    # 检查是否在正确的目录
    if [ ! -d "scripts" ]; then
        log_error "请在cloud/scripts目录下运行此脚本"
        exit 1
    fi

    # 执行部署步骤
    check_dependencies
    create_env_file
    create_redis_config
    create_docker_compose
    setup_redis
    install_python_deps

    # 询问是否测试
    read -p "是否测试限流器功能? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_rate_limiter
    fi

    create_monitoring_script

    echo
    echo "========================================"
    log_success "分布式限流器部署完成！"
    echo "========================================"
    echo
    echo "下一步操作："
    echo "1. 启动服务: docker-compose -f docker-compose.rate-limit.yml up -d"
    echo "2. 查看日志: docker-compose -f docker-compose.rate-limit.yml logs -f"
    echo "3. 监控状态: ./monitor-rate-limit.sh"
    echo "4. 访问前端: http://localhost:3000"
    echo "5. 访问后端API: http://localhost:8000/docs"
    echo
    echo "配置文件位置："
    echo "- 环境配置: ../.env"
    echo "- Redis配置: redis.conf"
    echo "- Docker配置: docker-compose.rate-limit.yml"
    echo
}

# 运行主函数
main "$@"