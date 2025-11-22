#!/usr/bin/env bash
# Verify production configuration for GPT Invite
set -euo pipefail

ENV_FILE=${1:-"cloud/.env"}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Env file not found: $ENV_FILE"
  echo "Usage: $0 path/to/.env"
  exit 1
fi

echo "🔍 Loading env: $ENV_FILE"
# shellcheck disable=SC2046
set -o allexport; source "$ENV_FILE"; set +o allexport

fail=false

require_nonempty() {
  local var_name=$1
  if [[ -z "${!var_name:-}" ]]; then
    echo "❌ Missing required: $var_name"
    fail=true
  else
    echo "✅ $var_name present"
  fi
}

echo "\n== Required variables =="
require_nonempty DOMAIN
require_nonempty ADMIN_INITIAL_PASSWORD
require_nonempty SECRET_KEY
require_nonempty ENCRYPTION_KEY
require_nonempty DATABASE_URL

echo "\n== Recommended variables =="
if [[ -z "${REDIS_URL:-}" ]]; then
  echo "⚠️  REDIS_URL missing (memory rate limiter will be used; not shared across instances)"
else
  echo "✅ REDIS_URL present"
fi

echo "\n== Policy checks =="
if [[ "${ENV:-${APP_ENV:-}}" != "production" && "${ENV:-${APP_ENV:-}}" != "prod" ]]; then
  echo "⚠️  ENV/APP_ENV is not production (ENV=${ENV:-}, APP_ENV=${APP_ENV:-})"
else
  echo "✅ ENV/APP_ENV indicates production"
fi

if [[ "$DOMAIN" == "localhost" || "$DOMAIN" == "127.0.0.1" ]]; then
  echo "❌ DOMAIN should be a public hostname in production"
  fail=true
fi

if [[ "$ADMIN_INITIAL_PASSWORD" == "admin" || ${#ADMIN_INITIAL_PASSWORD} -lt 12 ]]; then
  echo "❌ ADMIN_INITIAL_PASSWORD too weak (must not be 'admin' and length >= 12)"
  fail=true
fi

if [[ ${#SECRET_KEY} -lt 32 ]]; then
  echo "❌ SECRET_KEY too short (length >= 32 recommended)"
  fail=true
fi

# Check ENCRYPTION_KEY is base64 and 32 bytes after decode
echo "\n== ENCRYPTION_KEY validation =="
python3 - <<'PY' 2>/dev/null || true
import base64, os
key_b64 = os.environ.get('ENCRYPTION_KEY','')
try:
    raw = base64.b64decode(key_b64)
    print('✅ ENCRYPTION_KEY decodes to', len(raw), 'bytes')
    assert len(raw) == 32, 'must be 32 bytes'
except Exception as e:
    print('❌ ENCRYPTION_KEY invalid:', e)
    raise SystemExit(2)
PY
ek_rc=$?
if [[ $ek_rc -ne 0 ]]; then
  fail=true
fi

echo "\n== Connectivity checks (best-effort) =="
# Parse host:port from DATABASE_URL and REDIS_URL (best effort)
db_host=""; db_port=""
if [[ -n "${DATABASE_URL:-}" ]]; then
  # Extract host and port: scheme://user:pass@host:port/db
  db_host=$(echo "$DATABASE_URL" | sed -E 's|^[a-zA-Z0-9+]+://[^@]*@([^:/?#]+).*|\1|')
  db_port=$(echo "$DATABASE_URL" | sed -E 's|^[a-zA-Z0-9+]+://[^@]*@[^:]+:([0-9]+).*|\1|')
fi

redis_host=""; redis_port=""
if [[ -n "${REDIS_URL:-}" ]]; then
  redis_host=$(echo "$REDIS_URL" | sed -E 's|^redis://([^:/?#]+).*|\1|')
  redis_port=$(echo "$REDIS_URL" | sed -E 's|^redis://[^:]+:([0-9]+).*|\1|')
fi

nc_cmd="$(command -v nc || true)"
if [[ -n "$nc_cmd" ]]; then
  if [[ -n "$db_host" && -n "$db_port" ]]; then
    if nc -z "$db_host" "$db_port" >/dev/null 2>&1; then
      echo "✅ DB reachable: $db_host:$db_port"
    else
      echo "⚠️  DB not reachable: $db_host:$db_port"
    fi
  fi
  if [[ -n "$redis_host" && -n "$redis_port" ]]; then
    if nc -z "$redis_host" "$redis_port" >/dev/null 2>&1; then
      echo "✅ Redis reachable: $redis_host:$redis_port"
    else
      echo "⚠️  Redis not reachable: $redis_host:$redis_port"
    fi
  fi
else
  echo "ℹ️  nc not found; skipping TCP reachability checks"
fi

echo "\n== Summary =="
if [[ "$fail" == true ]]; then
  echo "❌ Validation failed"
  exit 1
else
  echo "✅ Validation passed"
fi

