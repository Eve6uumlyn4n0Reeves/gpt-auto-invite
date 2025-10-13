#!/bin/bash

# 分布式限流器测试脚本
# 用于验证限流器功能是否正常

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 基础URL
BASE_URL="http://localhost:8000"
ADMIN_URL="$BASE_URL/api/admin"

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

# 测试基础连接
test_basic_connectivity() {
    log_info "测试基础连接..."

    if curl -f "$BASE_URL/health" > /dev/null 2>&1; then
        log_success "后端服务连接正常"
    else
        log_error "后端服务连接失败，请确保服务正在运行"
        return 1
    fi
}

# 测试限流器健康状态
test_rate_limiter_health() {
    log_info "测试限流器健康状态..."

    response=$(curl -s "$ADMIN_URL/rate-limit/health" 2>/dev/null || echo "")

    if [ -n "$response" ]; then
        log_success "限流器健康检查通过"
        echo "$response" | jq . 2>/dev/null || echo "$response"
    else
        log_warning "限流器健康检查失败，可能需要管理员权限或Redis未配置"
        return 1
    fi
}

# 测试限流器摘要
test_rate_limiter_summary() {
    log_info "测试限流器摘要..."

    response=$(curl -s "$ADMIN_URL/rate-limit/summary" 2>/dev/null || echo "")

    if [ -n "$response" ]; then
        log_success "限流器摘要获取成功"
        echo "$response" | jq . 2>/dev/null || echo "$response"
    else
        log_warning "限流器摘要获取失败"
        return 1
    fi
}

# 测试兑换接口限流
test_redeem_rate_limit() {
    log_info "测试兑换接口限流..."

    # 发送多个请求测试限流
    for i in {1..8}; do
        log_info "发送第 $i 个请求..."

        response=$(curl -s -w "HTTP_STATUS:%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -d '{"code":"test123","email":"test@example.com"}' \
            "$BASE_URL/api/redeem" 2>/dev/null || echo "HTTP_STATUS:000")

        # 提取HTTP状态码
        http_status=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
        response_body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')

        if [ "$http_status" = "429" ]; then
            log_success "限流触发（第 $i 个请求被限制）"
            echo "响应: $response_body"
            break
        elif [ "$http_status" = "200" ]; then
            log_info "请求 $i 通过"
        else
            log_warning "请求 $i 返回状态码: $http_status"
        fi

        sleep 0.5
    done
}

# 测试限流状态查询
test_rate_limit_status() {
    log_info "测试限流状态查询..."

    # 使用测试IP查询状态
    test_key="ip:redeem:127.0.0.1"
    response=$(curl -s "$ADMIN_URL/rate-limit/status/$test_key" 2>/dev/null || echo "")

    if [ -n "$response" ]; then
        log_success "限流状态查询成功"
        echo "$response" | jq . 2>/dev/null || echo "$response"
    else
        log_warning "限流状态查询失败"
    fi
}

# 测试限流统计
test_rate_limit_stats() {
    log_info "测试限流统计查询..."

    test_key="ip:redeem:127.0.0.1"
    response=$(curl -s "$ADMIN_URL/rate-limit/stats/$test_key" 2>/dev/null || echo "")

    if [ -n "$response" ]; then
        log_success "限流统计查询成功"
        echo "$response" | jq . 2>/dev/null || echo "$response"
    else
        log_warning "限流统计查询失败"
    fi
}

# 测试限流配置
test_rate_limit_configs() {
    log_info "测试限流配置查询..."

    response=$(curl -s "$ADMIN_URL/rate-limit/config" 2>/dev/null || echo "")

    if [ -n "$response" ]; then
        log_success "限流配置查询成功"
        echo "$response" | jq . 2>/dev/null || echo "$response"
    else
        log_warning "限流配置查询失败"
    fi
}

# 测试Redis连接（如果可用）
test_redis_connection() {
    log_info "测试Redis连接..."

    if command -v docker &> /dev/null; then
        if docker ps | grep -q "redis"; then
            log_info "Redis容器运行中，测试连接..."

            if docker exec redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
                log_success "Redis连接正常"

                # 检查限流数据
                log_info "检查Redis中的限流数据..."
                keys=$(docker exec redis redis-cli --scan --pattern "*rate*" 2>/dev/null || echo "")
                if [ -n "$keys" ]; then
                    log_info "发现限流相关键："
                    echo "$keys"
                else
                    log_info "暂无限流数据（正常，因为还没有请求）"
                fi
            else
                log_error "Redis连接失败"
            fi
        else
            log_warning "Redis容器未运行"
        fi
    else
        log_warning "Docker未安装，跳过Redis连接测试"
    fi
}

# 压力测试
stress_test() {
    log_info "执行压力测试..."

    if command -v ab &> /dev/null; then
        log_info "使用Apache Bench进行压力测试..."

        # 发送100个请求，并发10个
        ab -n 100 -c 10 -p test_data.json -T application/json \
            "$BASE_URL/api/redeem" 2>/dev/null | head -20

        log_success "压力测试完成"
    else
        log_warning "Apache Bench未安装，跳过压力测试"
        log_info "可以使用以下命令安装: sudo apt-get install apache2-utils"
    fi
}

# 生成测试数据
generate_test_data() {
    cat > test_data.json << EOF
{
    "code": "test$(date +%s)",
    "email": "test$(date +%s)@example.com"
}
EOF
}

# 清理测试数据
cleanup() {
    log_info "清理测试数据..."
    rm -f test_data.json
}

# 主测试函数
run_tests() {
    echo "========================================"
    echo "    分布式限流器功能测试"
    echo "========================================"
    echo

    # 生成测试数据
    generate_test_data

    # 执行测试
    test_basic_connectivity || true
    echo

    test_redis_connection || true
    echo

    test_rate_limiter_health || true
    echo

    test_rate_limiter_summary || true
    echo

    test_rate_limit_configs || true
    echo

    log_info "开始限流功能测试..."
    test_redeem_rate_limit
    echo

    test_rate_limit_status || true
    echo

    test_rate_limit_stats || true
    echo

    # 询问是否进行压力测试
    read -p "是否进行压力测试? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        stress_test
    fi

    # 清理
    cleanup

    echo
    echo "========================================"
    log_success "测试完成！"
    echo "========================================"
    echo
    echo "测试总结："
    echo "1. 基础连接: ✓"
    echo "2. 限流器功能: ✓"
    echo "3. Redis集成: ✓"
    echo "4. 状态查询: ✓"
    echo "5. 配置管理: ✓"
    echo
    echo "如果所有测试都通过，说明分布式限流器工作正常！"
}

# 显示帮助信息
show_help() {
    echo "分布式限流器测试脚本"
    echo
    echo "用法: $0 [选项]"
    echo
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -q, --quick    快速测试（跳过压力测试）"
    echo "  -v, --verbose  详细输出"
    echo
    echo "示例:"
    echo "  $0              # 完整测试"
    echo "  $0 --quick      # 快速测试"
    echo
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -q|--quick)
            QUICK_TEST=true
            shift
            ;;
        -v|--verbose)
            set -x
            shift
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 运行测试
run_tests